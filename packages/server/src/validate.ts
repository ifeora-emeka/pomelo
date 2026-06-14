import { BadRequestError } from "./errors.js";

export interface FieldError {
  field: string;
  message: string;
}

export class ValidationError extends BadRequestError {
  errors: FieldError[];

  constructor(errors: FieldError[]) {
    super("Validation failed");
    this.name = "ValidationError";
    this.errors = errors;
  }
}

export interface FieldRuleResult {
  valid: boolean;
  value?: unknown;
  message?: string;
}

export type FieldRule = (value: unknown, field: string) => FieldRuleResult;

export type Schema = Record<string, FieldRule | FieldRule[]>;

export type Infer<S extends Schema> = Record<keyof S, unknown>;

function ok(value: unknown): FieldRuleResult {
  return { valid: true, value };
}

function fail(message: string): FieldRuleResult {
  return { valid: false, message };
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

/**
 * $rule — primitive field validators composed into a $validate schema.
 * Each rule both validates and coerces (e.g. number() returns a real number).
 */
export const $rule = {
  string(opts: { min?: number; max?: number } = {}): FieldRule {
    return (value, field) => {
      if (typeof value !== "string") {
        return fail(`${field} must be a string`);
      }
      if (opts.min !== undefined && value.length < opts.min) {
        return fail(`${field} must be at least ${opts.min} characters`);
      }
      if (opts.max !== undefined && value.length > opts.max) {
        return fail(`${field} must be at most ${opts.max} characters`);
      }
      return ok(value);
    };
  },

  number(opts: { min?: number; max?: number; integer?: boolean } = {}): FieldRule {
    return (value, field) => {
      const num = typeof value === "string" ? Number(value) : value;
      if (typeof num !== "number" || Number.isNaN(num)) {
        return fail(`${field} must be a number`);
      }
      if (opts.integer && !Number.isInteger(num)) {
        return fail(`${field} must be an integer`);
      }
      if (opts.min !== undefined && num < opts.min) {
        return fail(`${field} must be at least ${opts.min}`);
      }
      if (opts.max !== undefined && num > opts.max) {
        return fail(`${field} must be at most ${opts.max}`);
      }
      return ok(num);
    };
  },

  boolean(): FieldRule {
    return (value, field) => {
      if (typeof value === "boolean") return ok(value);
      if (value === "true" || value === "on" || value === "1") return ok(true);
      if (value === "false" || value === "" || value === "0" || value === undefined)
        return ok(false);
      return fail(`${field} must be a boolean`);
    };
  },

  email(): FieldRule {
    return (value, field) => {
      if (typeof value !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return fail(`${field} must be a valid email`);
      }
      return ok(value);
    };
  },

  required(): FieldRule {
    return (value, field) => {
      if (isEmpty(value)) {
        return fail(`${field} is required`);
      }
      return ok(value);
    };
  },

  optional(): FieldRule {
    return (value) => ok(isEmpty(value) ? undefined : value);
  },

  oneOf(values: readonly unknown[]): FieldRule {
    return (value, field) => {
      if (!values.includes(value)) {
        return fail(`${field} must be one of: ${values.join(", ")}`);
      }
      return ok(value);
    };
  },

  pattern(regex: RegExp, message?: string): FieldRule {
    return (value, field) => {
      if (typeof value !== "string" || !regex.test(value)) {
        return fail(message ?? `${field} is invalid`);
      }
      return ok(value);
    };
  },
};

function runRules(
  rules: FieldRule | FieldRule[],
  value: unknown,
  field: string,
): FieldRuleResult {
  const list = Array.isArray(rules) ? rules : [rules];
  let current = value;
  for (const rule of list) {
    const result = rule(current, field);
    if (!result.valid) return result;
    if ("value" in result) current = result.value;
  }
  return ok(current);
}

/**
 * $validate — validates and coerces an input object against a schema.
 * Throws ValidationError (400) with per-field errors on failure; returns the
 * coerced, typed object on success. Use inside $page, $action, or API routes.
 *
 * Usage:
 *   const data = $validate(input, {
 *     email: [$rule.required(), $rule.email()],
 *     age: $rule.number({ min: 18 }),
 *   });
 */
export function $validate<S extends Schema>(
  input: unknown,
  schema: S,
): Infer<S> {
  const source = (input ?? {}) as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  const errors: FieldError[] = [];

  for (const field of Object.keys(schema)) {
    const rules = schema[field]!;
    const outcome = runRules(rules, source[field], field);
    if (!outcome.valid) {
      errors.push({ field, message: outcome.message ?? `${field} is invalid` });
    } else {
      result[field] = outcome.value;
    }
  }

  if (errors.length > 0) {
    throw new ValidationError(errors);
  }

  return result as Infer<S>;
}
