"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isGhostProfile,
  listReviewableMemberIDs,
} = require("../Commands/تنظيف");

test("treats unnamed or missing profiles as ghost accounts", () => {
  const profiles = {
    1: { name: "Ali" },
    2: { name: "" },
    3: { name: "Facebook User" },
  };

  assert.equal(isGhostProfile(profiles, "1"), false);
  assert.equal(isGhostProfile(profiles, "2"), true);
  assert.equal(isGhostProfile(profiles, "3"), true);
  assert.equal(isGhostProfile(profiles, "4"), true);
  assert.equal(isGhostProfile(null, "1"), true);
});

test("lists members without the bot and without admins", () => {
  const info = {
    participantIDs: ["1", "2", "3", "99"],
    adminIDs: [{ id: "2" }],
  };

  assert.deepEqual(listReviewableMemberIDs(info, "99"), ["1", "3"]);
});

test("refuses to review when participants are unavailable", () => {
  assert.throws(
    () => listReviewableMemberIDs({}, "99"),
    /تعذر قراءة أعضاء المجموعة/,
  );
});
