import test from "node:test";
import assert from "node:assert";
import { KalloLogger } from "./logger.js";

test("KalloLogger formats messages correctly", () => {
  const infoMsg = KalloLogger.info("Server started");
  const warnMsg = KalloLogger.warn("Missing layout");
  const errMsg = KalloLogger.error("Port conflict");

  assert.ok(infoMsg.includes("INFO:"));
  assert.ok(infoMsg.includes("Server started"));

  assert.ok(warnMsg.includes("WARN:"));
  assert.ok(warnMsg.includes("Missing layout"));

  assert.ok(errMsg.includes("ERROR:"));
  assert.ok(errMsg.includes("Port conflict"));
});
