from datetime import timedelta

from fastapi.testclient import TestClient

from helpers import RUBRIC_SENTINEL, Factory, all_keys, budget_used

RUBRIC_KEYS = {
    "question_script",
    "grounding",
    "subject",
    "good_answer_covers",
    "access_token",
}


def test_candidate_state_never_contains_the_rubric(
    client: TestClient, make: Factory
) -> None:
    _, evaluation, _ = make.scored_candidate(make.run())
    interview = make.interview(evaluation, status="in_progress")
    make.turn(interview, 1, "interviewer", "question", content="Tell me about X")

    res = client.get(f"/interviews/{interview.access_token}")

    assert res.status_code == 200
    assert not (all_keys(res.json()) & RUBRIC_KEYS)
    assert RUBRIC_SENTINEL not in res.text


def test_spoken_answer_text_is_hidden_from_the_candidate(
    client: TestClient, make: Factory
) -> None:
    _, evaluation, _ = make.scored_candidate(make.run())
    interview = make.interview(evaluation, status="in_progress", mode="audio")
    make.turn(interview, 1, "interviewer", "question", content="Tell me about X")
    make.turn(
        interview,
        2,
        "candidate",
        "answer",
        content="I used engine x",
        audio_path="interviews/secret/2.webm",
        audio_mime_type="audio/webm",
    )

    res = client.get(f"/interviews/{interview.access_token}")

    turns = res.json()["turns"]
    assert turns[0]["content"] == "Tell me about X"
    assert turns[1]["content"] is None
    assert turns[1]["has_audio"] is True
    assert "I used engine x" not in res.text
    assert "interviews/secret" not in res.text


def test_finished_interview_withholds_the_transcript(
    client: TestClient, make: Factory
) -> None:
    _, evaluation, _ = make.scored_candidate(make.run())
    interview = make.interview(evaluation, status="completed")
    make.turn(interview, 1, "interviewer", "question")

    res = client.get(f"/interviews/{interview.access_token}")
    assert res.json()["turns"] == []


def test_expired_invite_cannot_start(client: TestClient, make: Factory) -> None:
    _, evaluation, _ = make.scored_candidate(make.run())
    interview = make.interview(evaluation, expires_in=timedelta(minutes=-1))
    token = interview.access_token

    assert client.get(f"/interviews/{token}").json()["status"] == "expired"
    assert client.post(f"/interviews/{token}/start").status_code == 400


def test_unknown_interview_token_is_404(client: TestClient) -> None:
    assert client.get("/interviews/not-a-real-token").status_code == 404


def test_audio_interview_rejects_typed_answers(
    client: TestClient, make: Factory
) -> None:
    _, evaluation, _ = make.scored_candidate(make.run())
    interview = make.interview(evaluation, status="in_progress", mode="audio")

    res = client.post(
        f"/interviews/{interview.access_token}/answers",
        json={"content": "typed", "after_seq": 0},
    )

    assert res.status_code == 400
    assert "spoken" in res.json()["detail"]
    assert budget_used() == 0


def test_text_interview_rejects_spoken_answers(
    client: TestClient, make: Factory
) -> None:
    _, evaluation, _ = make.scored_candidate(make.run())
    interview = make.interview(evaluation, status="in_progress", mode="text")

    res = client.post(
        f"/interviews/{interview.access_token}/answers-audio",
        data={"after_seq": "0"},
        files={"audio": ("a.webm", b"\x1a\x45\xdf\xa3", "audio/webm")},
    )

    assert res.status_code == 400
    assert "typed" in res.json()["detail"]
    assert budget_used() == 0
