/**
 * Tests for the status pill shown on a property card.
 *
 * WHY THESE EXIST: the card used to read the certificate engine alone. A
 * property with valid certificates and not one month recorded showed a green
 * "Compliant" pill while the nav badge counted twelve overdue declarations for
 * that same property. Two derivations, two answers, and the reassuring one was
 * the bigger and greener of the two.
 *
 * A green pill is the single most consequential pixel in Domus. It is the thing
 * a landlord glances at to decide they can stop thinking about a property. If
 * it can be green while something is outstanding, the product has done the
 * opposite of its job.
 *
 * Mirrors getPropertyStatus in src/lib/notifications.ts; change together.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

function getPropertyStatus(propertyId, items) {
  const mine = items.filter((n) => n.propertyId === propertyId);
  if (mine.some((n) => n.priority === "high")) return "action";
  if (mine.length > 0) return "renew";
  return "compliant";
}

const high = (propertyId, id = "h") => ({ id, propertyId, priority: "high" });
const medium = (propertyId, id = "m") => ({ id, propertyId, priority: "medium" });

/* --------------------------------- tests --------------------------------- */

test("nothing outstanding is the only way to go green", () => {
  assert.equal(getPropertyStatus("p1", []), "compliant");
});

test("an unrecorded month keeps the pill off green", () => {
  // The exact case that was broken: certificates fine, records empty.
  assert.equal(getPropertyStatus("p1", [high("p1", "decl:p1:2026-07:stay")]), "action");
});

test("a medium-priority item shows renew, not compliant", () => {
  assert.equal(getPropertyStatus("p1", [medium("p1")]), "renew");
});

test("high beats medium when both are present", () => {
  assert.equal(getPropertyStatus("p1", [medium("p1", "m1"), high("p1", "h1")]), "action");
});

test("another property's problems do not colour this one", () => {
  // Six properties on one screen; each pill must speak only for its own card.
  assert.equal(getPropertyStatus("p1", [high("p2"), medium("p3")]), "compliant");
});

test("the pill agrees with the nav badge", () => {
  // Both read the same feed, so they cannot disagree. This is the regression
  // that mattered: badge counting twelve while the card said compliant.
  const feed = [high("p1", "a"), high("p1", "b"), medium("p2", "c")];
  const badgeCount = feed.filter((n) => n.priority === "high").length;
  assert.equal(badgeCount > 0, getPropertyStatus("p1", feed) === "action");
});

test("snoozing does not turn a card green", () => {
  // getPropertyStatus is handed the full feed, not the filtered one. Snooze
  // hides the nagging; it does not file the declaration.
  const feed = [high("p1", "decl:p1:2026-07:stay")];
  const dismissed = new Set(["decl:p1:2026-07:stay"]);
  assert.equal(getPropertyStatus("p1", feed), "action");
  // The badge, by contrast, is allowed to go quiet.
  assert.equal(feed.filter((n) => !dismissed.has(n.id)).length, 0);
});
