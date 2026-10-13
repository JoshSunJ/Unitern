import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { GET } from "../app/api/photos/listings/[filename]/route";

const prior = { ...process.env };
const filename = "12345678-1234-1234-1234-123456789abc.png";
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
process.env.AUTH_URL = "https://unitern.example";
process.env.PHOTO_PUBLIC_BASE_URL = "https://unitern.example/api/photos";
process.env.S3_BUCKET = "unitern-production-photos";
process.env.S3_REGION = "auto";
const get = (name: string) => GET(new Request(`https://unitern.example/api/photos/listings/${name}`), { params: Promise.resolve({ filename: name }) });

after(() => { process.env = prior; mock.restoreAll(); });

test("app photo delivery serves a bounded image from only the listing namespace", async () => {
  const send = mock.method(S3Client.prototype, "send", async (command: GetObjectCommand) => {
    assert.equal(command.input.Bucket, "unitern-production-photos");
    assert.equal(command.input.Key, `listings/${filename}`);
    return { Body: { transformToByteArray: async () => png }, ContentLength: png.length, ContentType: "image/png", ETag: '"one"' };
  });
  const response = await get(filename);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("cache-control"), "public, max-age=3600");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), png);
  for (const name of ["../private.json", "account.json", "../../secret.png", `${filename}.html`]) assert.equal((await get(name)).status, 404);
  process.env.PHOTO_PUBLIC_BASE_URL = "https://other-photo-origin.example";
  assert.equal((await get(filename)).status, 404);
  assert.equal(send.mock.callCount(), 1);
  process.env.PHOTO_PUBLIC_BASE_URL = "https://unitern.example/api/photos";
  send.mock.restore();
});

test("photo delivery hides missing objects and refuses non-image or oversized content", async () => {
  const send = mock.method(S3Client.prototype, "send", async () => { throw Object.assign(new Error("private-provider-detail"), { name: "NoSuchKey" }); });
  assert.equal((await get(filename)).status, 404);
  send.mock.mockImplementation(async () => ({ Body: { transformToByteArray: async () => png }, ContentLength: png.length, ContentType: "text/html" }));
  assert.equal((await get(filename)).status, 503);
  let bodyRead = false;
  send.mock.mockImplementation(async () => ({ Body: { transformToByteArray: async () => { bodyRead = true; return png; } }, ContentLength: 6 * 1024 * 1024, ContentType: "image/png" }));
  assert.equal((await get(filename)).status, 503);
  assert.equal(bodyRead, false);
});
