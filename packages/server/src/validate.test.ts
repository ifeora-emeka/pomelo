import test from "node:test";
import assert from "node:assert";
import { $validate, $rule, ValidationError } from "./validate.js";

test("$validate returns coerced values on success", () => {
  const data = $validate(
    { email: "a@b.com", age: "21", agree: "on" },
    {
      email: [$rule.required(), $rule.email()],
      age: $rule.number({ min: 18, integer: true }),
      agree: $rule.boolean(),
    },
  );
  assert.strictEqual(data.email, "a@b.com");
  assert.strictEqual(data.age, 21);
  assert.strictEqual(data.agree, true);
});

test("$validate throws ValidationError with per-field messages", () => {
  assert.throws(
    () =>
      $validate(
        { email: "not-an-email", age: "5" },
        {
          email: [$rule.required(), $rule.email()],
          age: $rule.number({ min: 18 }),
        },
      ),
    (err: unknown) => {
      assert.ok(err instanceof ValidationError);
      assert.strictEqual(err.statusCode, 400);
      const fields = err.errors.map((e) => e.field).sort();
      assert.deepStrictEqual(fields, ["age", "email"]);
      return true;
    },
  );
});

test("$validate required catches missing and empty values", () => {
  assert.throws(
    () => $validate({ name: "" }, { name: $rule.required() }),
    (err: unknown) => err instanceof ValidationError,
  );
  assert.throws(
    () => $validate({}, { name: $rule.required() }),
    (err: unknown) => err instanceof ValidationError,
  );
});

test("$validate optional allows missing values", () => {
  const data = $validate({}, { nickname: $rule.optional() });
  assert.strictEqual(data.nickname, undefined);
});

test("$rule.oneOf and pattern enforce constraints", () => {
  const data = $validate(
    { role: "admin", slug: "my-post" },
    {
      role: $rule.oneOf(["admin", "user"]),
      slug: $rule.pattern(/^[a-z-]+$/, "slug must be lowercase"),
    },
  );
  assert.strictEqual(data.role, "admin");
  assert.strictEqual(data.slug, "my-post");

  assert.throws(
    () => $validate({ role: "root" }, { role: $rule.oneOf(["admin", "user"]) }),
    (err: unknown) => err instanceof ValidationError,
  );
});

test("$validate string min/max bounds", () => {
  assert.throws(
    () => $validate({ pw: "short" }, { pw: $rule.string({ min: 8 }) }),
    (err: unknown) => err instanceof ValidationError,
  );
  const data = $validate({ pw: "longenough" }, { pw: $rule.string({ min: 8 }) });
  assert.strictEqual(data.pw, "longenough");
});
