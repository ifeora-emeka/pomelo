import test from "node:test";
import assert from "node:assert";
import { PomeloLogger } from "./logger.js";

test("PomeloLogger formats messages correctly", () => {
  const infoMsg = PomeloLogger.info("Server started");
  const warnMsg = PomeloLogger.warn("Missing layout");
  const errMsg = PomeloLogger.error("Port conflict");

  assert.ok(infoMsg.includes("INFO:"));
  assert.ok(infoMsg.includes("Server started"));

  assert.ok(warnMsg.includes("WARN:"));
  assert.ok(warnMsg.includes("Missing layout"));

  assert.ok(errMsg.includes("ERROR:"));
  assert.ok(errMsg.includes("Port conflict"));
});
