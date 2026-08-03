import type {
  InterviewState,
  InterviewStateEvent,
  InterviewTurnData,
} from "@/lib/interview-types";

import { apiRequest, apiUrl, authHeaders, errorMessage } from "./api";

export async function getInterviewState(token: string): Promise<InterviewState> {
  return apiRequest<InterviewState>(`/interviews/${token}`);
}

export async function startInterview(token: string): Promise<InterviewState> {
  return apiRequest<InterviewState>(`/interviews/${token}/start`, {
    method: "POST",
  });
}

export interface AnswerStreamHandlers {
  onAck: (answerSeq: number) => void;
  onTurn: (turn: InterviewTurnData) => void;
  onState: (state: InterviewStateEvent) => void;
  onDone: () => void;
  /** status is the HTTP code when the request failed before streaming
   * (e.g. 409 = stale after_seq), undefined for mid-stream errors. */
  onError: (message: string, status?: number) => void;
}

/**
 * Submit one answer and stream the interviewer's reaction over SSE.
 *
 * apiRequest can't be used here (it JSON-parses whole bodies), so this is a
 * raw fetch + a ~30-line SSE frame parser: split on blank lines, read
 * `event:`/`data:` fields, ignore unknown event names (the protocol is
 * append-only across phases).
 */
export async function submitAnswer(
  token: string,
  content: string,
  afterSeq: number,
  handlers: AnswerStreamHandlers
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(apiUrl(`/interviews/${token}/answers`), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ content, after_seq: afterSeq }),
    });
  } catch {
    handlers.onError("Network error. Please check your connection.", 0);
    return;
  }

  if (!response.ok || !response.body) {
    handlers.onError(await errorMessage(response), response.status);
    return;
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
      case "ack":
        handlers.onAck((parsed as { answer_seq: number }).answer_seq);
        break;
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
        handlers.onError((parsed as { detail?: string }).detail ?? "Stream error");
        break;
      // Unknown events (Phase 2 additions) are ignored on purpose.
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
      handlers.onError("Connection lost while receiving the response.");
    }
    return;
  }

  // Stream ended without a done/error frame (e.g. server dropped mid-turn).
  if (!sawTerminalEvent) {
    handlers.onError("The response ended unexpectedly.");
  }
}
