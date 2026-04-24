'use strict';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'assertion failed');
  }
}

function assertEq(actual, expected, message) {
  if (actual !== expected) {
    const prefix = message ? message + ': ' : '';
    throw new Error(prefix + 'expected ' + JSON.stringify(expected) + ' but got ' + JSON.stringify(actual));
  }
}

function test(name, fn) {
  return { name: String(name || '').trim() || '(unnamed)', fn };
}

async function runTests(tests) {
  const startedAt = Date.now();
  let passed = 0;
  const failures = [];

  for (const t of tests) {
    try {
      const out = t.fn();
      if (out && typeof out.then === 'function') {
        await out;
      }
      passed += 1;
    } catch (e) {
      failures.push({
        name: t.name,
        error: String(e && e.stack ? e.stack : e),
      });
    }
  }

  const failed = failures.length;
  return {
    success: failed === 0,
    passed,
    failed,
    durationMs: Date.now() - startedAt,
    failures,
  };
}

module.exports = {
  assert,
  assertEq,
  test,
  runTests,
};

