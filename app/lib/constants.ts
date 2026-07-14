/** Circled numerals used to label the four answer choices. */
export const CHOICE_LABELS = ['①', '②', '③', '④'] as const;

/** Score (out of 100) required to pass, mirroring the real written exam. */
export const PASS_THRESHOLD = 60;

/** Time budget allotted per question in timed exam mode. */
export const SECONDS_PER_QUESTION = 90;

/** Remaining time under which the exam timer switches to a warning state. */
export const LOW_TIME_SECONDS = 600;

/** Maximum number of past results kept in local storage. */
export const MAX_RESULT_HISTORY = 50;
