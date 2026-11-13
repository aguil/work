import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickJjWorkspaceName } from "./jj.js";

describe("pickJjWorkspaceName", () => {
  const dest = "/home/u/dev/projects/product-design/ts-grc";

  it("uses the folder name when it is free", () => {
    assert.equal(
      pickJjWorkspaceName(new Set(["default"]), dest, "product-design"),
      "ts-grc",
    );
  });

  it("prefixes the project when the folder name is taken", () => {
    assert.equal(
      pickJjWorkspaceName(
        new Set(["default", "ts-grc"]),
        dest,
        "product-design",
      ),
      "product-design-ts-grc",
    );
  });

  it("adds a number when both names are taken", () => {
    assert.equal(
      pickJjWorkspaceName(
        new Set(["ts-grc", "product-design-ts-grc"]),
        dest,
        "product-design",
      ),
      "product-design-ts-grc-2",
    );
  });

  it("sanitizes branch-style prefixes", () => {
    assert.equal(
      pickJjWorkspaceName(new Set(["ts-grc"]), dest, "fix/foo"),
      "fix-foo-ts-grc",
    );
  });

  it("numbers the folder name when there is no prefix", () => {
    assert.equal(pickJjWorkspaceName(new Set(["ts-grc"]), dest), "ts-grc-2");
  });
});
