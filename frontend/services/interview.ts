import type {
  InterviewState,
  InterviewStateEvent,
  InterviewTurnData,
} from "@/lib/interview-types";

import { ApiError, apiFetch, apiRequest, authHeaders } from "./api";

export async function getInterviewState(token: string): Promise<InterviewState> {
  return apiRequest<InterviewState>(`/interviews/${token}`);
}

export async function startInterview(token: string): Promise<InterviewState> {
  return apiRequest<InterviewState>(`/interviews/${token}/start`, {
    method: "POST",
  });
}

/**
 * Fetch the interviewer's synthesized speech for one turn.
 *
 * apiFetch rather than apiRequest, which ends in res.json(): the endpoint
 * returns audio bytes. Fetched into a Blob rather than pointed at by a bare
 * `<audio src>` so the response goes through the same error handling as every
 * other call and the object URL's lifetime stays under our control. Same shape
 * as fetchInterviewTurnAudio.
 *
 * The clip is cached server-side after the first request, so a slow first call
 * (synthesis) is followed by fast ones.
 */
export async function fetchVoiceClip(token: string, key: string): Promise<Blob> {
  const res = await apiFetch(`/interviews/${token}/voice/${key}`, {
    headers: authHeaders(),
  });
  return res.blob();
}

export interface AnswerStreamHandlers {
  /** content is the answer text the server committed. The audio path has no
   * other way to learn it; the typed path can use it instead of its own draft. */
  onAck: (answerSeq: number, content: string) => void;
  onTurn: (turn: InterviewTurnData) => void;
  onState: (state: InterviewStateEvent) => void;
  onDone: () => void;
  /** status is the HTTP code when the request failed before streaming
   * (e.g. 409 = stale after_seq), undefined for mid-stream errors. */
  onError: (message: string, status?: number) => void;
}

/**
 * Read one answer stream to completion, dispatching frames to the handlers.
 *
 * Resolves to the error message if the answer failed, or null if it was
 * accepted — so a caller that must react to the outcome (the recorder, which
 * holds the blob until a submit succeeds) can await it directly instead of
 * capturing it out of a callback.
 *
 * apiRequest can't be used for these responses (it JSON-parses whole bodies),
 * so this is a ~30-line SSE frame parser: split on blank lines, read
 * `event:`/`data:` fields, ignore unknown event names (the protocol is
 * append-only across phases). Shared by both submit functions so the typed and
 * spoken paths can't drift.
 */
async function readAnswerStream(
  response: Response,
  handlers: AnswerStreamHandlers
): Promise<string | null> {
  let failure: string | null = null;
  const fail = (message: string, status?: number) => {
    failure = message;
    handlers.onError(message, status);
  };

  if (!response.body) {
    fail("The response ended unexpectedly.", response.status);
    return failure;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawTerminalEvent = false;

  const dispatch = (frame: string) => {
    let event = "";
    let data = "";
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    if (!event) return;
    let parsed: unknown = {};
    try {
      parsed = data ? JSON.parse(data) : {};
    } catch {
      return;
    }
    switch (event) {
      case "ack": {
        const ack = parsed as { answer_seq: number; content: string };
        handlers.onAck(ack.answer_seq, ack.content);
        break;
      }
      case "turn":
        handlers.onTurn(parsed as InterviewTurnData);
        break;
      case "state":
        handlers.onState(parsed as InterviewStateEvent);
        break;
      case "done":
        sawTerminalEvent = true;
        handlers.onDone();
        break;
      case "error":
        sawTerminalEvent = true;
        fail((parsed as { detail?: string }).detail ?? "Stream error");
        break;
      // Unknown events (later-phase additions) are ignored on purpose.
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        dispatch(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");
      }
    }
  } catch {
    if (!sawTerminalEvent) {
      fail("Connection lost while receiving the response.");
    }
    return failure;
  }

  // Stream ended without a done/error frame (e.g. server dropped mid-turn).
  if (!sawTerminalEvent) {
    fail("The response ended unexpectedly.");
  }

  return failure;
}

/**
 * Open an answer stream and read it, mapping a pre-stream failure (network,
 * 4xx, 5xx) onto the same handlers as a mid-stream one.
 *
 * Resolves to the error message, or null if the answer was accepted.
 */
async function submitAndRead(
  endpoint: string,
  init: RequestInit,
  handlers: AnswerStreamHandlers
): Promise<string | null> {
  let response: Response;
  try {
    response = await apiFetch(endpoint, init);
  } catch (err) {
    const { message, status } =
      err instanceof ApiError
        ? err
        : { message: "Something went wrong. Please try again.", status: 0 };
    handlers.onError(message, status);
    return message;
  }

  return readAnswerStream(response, handlers);
}

/** Submit one typed answer and stream the interviewer's reaction over SSE. */
export async function submitAnswer(
  token: string,
  content: string,
  afterSeq: number,
  handlers: AnswerStreamHandlers
): Promise<string | null> {
  return submitAndRead(
    `/interviews/${token}/answers`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ content, after_seq: afterSeq }),
    },
    handlers
  );
}

/**
 * Upload one recorded answer for transcription and stream the reaction.
 *
 * The caller keeps the blob until this resolves to null: a non-null result
 * means nothing was committed server-side, so retrying re-sends the same
 * recording rather than making the candidate speak again.
 */
export async function submitAudioAnswer(
  token: string,
  blob: Blob,
  afterSeq: number,
  handlers: AnswerStreamHandlers
): Promise<string | null> {
  const form = new FormData();
  // As a File so the part carries a filename; the server reads content_type
  // from the blob's own type, which is what MediaRecorder actually produced.
  form.append("audio", new File([blob], "answer", { type: blob.type }));
  form.append("after_seq", String(afterSeq));

  return submitAndRead(
    `/interviews/${token}/answers-audio`,
    {
      method: "POST",
      // authHeaders() only: setting Content-Type by hand drops the multipart
      // boundary the browser generates, and the upload silently fails to parse.
      headers: authHeaders(),
      body: form,
    },
    handlers
  );
}
