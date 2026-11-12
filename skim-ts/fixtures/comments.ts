// Detached header comment: DETACHED_FILE_HEADER

/**
 * JSDOC_IFACE: a documented interface.
 */
export interface Config<T /* TP_COMMENT */> {
  /** JSDOC_MEMBER_ID the identifier */
  id: string; // TRAILING_MEMBER
  // LINE_MEMBER_COMMENT
  name?: /* INLINE_TYPE_COMMENT */ string;
  run(/* PARAM_IN_SIG */ x: number): void;
}

// DETACHED_ABOVE_CLASS

/** JSDOC_CLASS Service docs. */
@Injectable() // DECORATOR_TRAILING
export class Service {
  /** JSDOC_FIELD */
  private db: string; // FIELD_TRAILING

  // plain comment, not doc
  /** JSDOC_METHOD fetches */
  @Log()
  public async fetch(
    // COMMENT_IN_PARAMS
    id: string, /* AFTER_ID */
    other: number // LAST_PARAM
  ): /* BEFORE_RETURN */ Promise<string> /* BEFORE_BRACE */ {
    // BODY_COMMENT
    return id;
  }

  handler = (a: number /* ARROW_PARAM */): void => {
    return;
  };
}

/** JSDOC_ENUM colors */
export enum Color {
  /** JSDOC_RED */
  Red = 1, // ENUM_TRAILING
  // ENUM_LINE
  Green = /* ENUM_INLINE */ 2,
}

/**
 * JSDOC_FN adds numbers.
 * @param a first
 */
export function add(a: number, /* INLINE_PARAM */ b: number): number { // AFTER_BRACE
  return a + b;
}

/** JSDOC_ARROW arrow doc */
export const twice = (x: number /* ARROW_INLINE */): number => x * 2;

// DETACHED_ABOVE_FN

export function plain(x: string): string {
  return x;
}
