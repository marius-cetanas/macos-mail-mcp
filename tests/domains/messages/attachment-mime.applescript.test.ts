import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { composeScript, escapeForAppleScript, SHARED_HANDLER_FILES, substituteParams } from "../../../src/bridge/applescript-runner.js";
import { onMacOS } from "../../helpers/run-applescript.js";

const files = ["list-attachments", "get-message", "get-message-by-id"];
const source = (file: string) => readFileSync(`src/domains/messages/scripts/${file}.applescript`, "utf8");
const shared = () => SHARED_HANDLER_FILES.map((file) => readFileSync(join("src/bridge", file), "utf8"));
const literal = (text: string) => `"${escapeForAppleScript(text)}"`;
const readTemplate = source("read-attachment");

function run(body: string): string {
  return execFileSync("osascript", ["-"], {
    input: composeScript(shared(), body), encoding: "utf8", timeout: 20_000,
  }).replace(/\n$/, "");
}

function admission(name: string, mimeExpression: string): unknown {
  return JSON.parse(run([
    `set effectiveMime to my attachmentMimeType(${literal(name)}, ${mimeExpression})`,
    "try", `my requireReadableAttachment(${literal(name)}, effectiveMime)`,
    'return "{\\"accepted\\":true,\\"mime\\":\\"" & my escapeForJson(effectiveMime) & "\\"}"',
    "on error errMsg", 'return "{\\"error\\":\\"" & my escapeForJson(errMsg) & "\\"}"', "end try",
  ].join("\n")));
}

function metadata(file: string, name: string, mimeExpression: string, getterError = false): unknown {
  const template = source(file);
  const start = template.indexOf('set attachJson to ""');
  const end = template.indexOf("end repeat", start) + "end repeat".length;
  expect(start).toBeGreaterThanOrEqual(0);
  let flow = template.slice(start, end).replace("mail attachments of msg", "fixtureAttachments");
  flow = flow.replace("MIME type of att", "my fixtureMime(att)");
  return JSON.parse(run([
    "using terms from application \"Mail\"",
    "on fixtureMime(att)", getterError ? 'error "MIME getter unavailable" number -1728' : "return MIME type of att", "end fixtureMime",
    `set fixtureAttachments to {{name:${literal(name)}, MIME type:${mimeExpression}, file size:400, downloaded:true}}`,
    flow, 'return "[" & attachJson & "]"', "end using terms from",
  ].join("\n")));
}

function readFlow(options: { name?: string; mime?: string; getterError?: boolean; missing?: boolean; downloaded?: boolean; saveError?: boolean; readError?: boolean; nameError?: boolean } = {}): { result: unknown; saved: boolean; madeTemp: boolean; leakedTemp: boolean } {
  const dir = mkdtempSync(join(tmpdir(), "mail-mcp-mime-"));
  try {
    const name = options.name ?? "calendar.ics";
    const nameFile = join(dir, "attname.txt");
    const contentFile = join(dir, "content.txt");
    const nativeTemp = join(dir, "native-temp");
    const saveLog = join(dir, "saved");
    const tempLog = join(dir, "made-temp");
    writeFileSync(nameFile, name, "utf8");
    const content = 'BEGIN:VCALENDAR\r\nSUMMARY: café "quoted" \\ 😀\r\nEND:VCALENDAR\r\n\n';
    writeFileSync(contentFile, content, "utf8");
    if (options.nameError) rmSync(nameFile);
    const template = substituteParams(readTemplate, {
      attNameFile: nameFile, accountName: "Fixture", mailboxName: "INBOX", messageId: "1",
    })
      .replace('tell application "Mail"', 'using terms from application "Mail"')
      .replace(/^end tell$/m, "end using terms from")
      .replace('my resolveMailbox("Fixture", "INBOX")', '"Fixture/INBOX"')
      .replace("(first message of theMailbox whose id is 1)", '"message fixture"')
      .replace("mail attachments of msg", "fixtureAttachments")
      .replace("MIME type of targetAttachment", "my fixtureMime(targetAttachment)")
      .replace('do shell script "mktemp -d"', "my fixtureTemp()")
      .replace("save targetAttachment in POSIX file tempPath", "my fixtureSave(targetAttachment, tempPath)");
    expect(template).not.toContain('tell application "Mail"');
    expect(template).not.toContain("save targetAttachment in");
    const result = run([
      "using terms from application \"Mail\"",
      `set fixtureAttachments to ${options.missing ? "{}" : `{{name:"unrelated.bin", MIME type:"image/png", downloaded:true}, {name:${literal(name)}, MIME type:${options.mime === undefined ? '"text/calendar"' : options.mime}, downloaded:${options.downloaded !== false}}, {name:"later.bin", MIME type:"application/octet-stream", downloaded:true}}`}`,
      "end using terms from",
      "on fixtureMime(att)", options.getterError ? 'error "MIME unavailable" number -1728' : 'using terms from application "Mail"\nreturn MIME type of att\nend using terms from', "end fixtureMime",
      "on fixtureTemp()",
      `do shell script "mkdir " & quoted form of ${literal(nativeTemp)}`,
      `do shell script "touch " & quoted form of ${literal(tempLog)}`, `return ${literal(nativeTemp)}`, "end fixtureTemp",
      "on fixtureSave(att, destination)",
      `using terms from application "Mail"\nif name of att as text is not ${literal(name)} then error "wrong selected attachment"\nend using terms from`,
      `do shell script "touch " & quoted form of ${literal(saveLog)}`,
      options.readError ? 'do shell script "mkdir " & quoted form of destination' : `do shell script "cp " & quoted form of ${literal(contentFile)} & " " & quoted form of destination`,
      options.saveError ? 'error "save failed \\"quoted\\"" number -10000' : "return", "end fixtureSave",
      "try", template, 'on error errMsg number errNum\nreturn "{\\"error\\":\\"" & my escapeForJson(errMsg) & "\\",\\"errorNumber\\":" & my integerForJson(errNum) & "}"\nend try',
    ].join("\n"));
    return { result: JSON.parse(result), saved: existsSync(saveLog), madeTemp: existsSync(tempLog), leakedTemp: existsSync(nativeTemp) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("attachment MIME policy wiring", () => {
  it("shares one MIME fallback with all metadata serializers and read admission", () => {
    expect(SHARED_HANDLER_FILES).toContain("attachment-mime.applescript");
    for (const file of files) {
      expect(source(file)).not.toContain("on mimeFromExtension(");
      expect(source(file)).toContain("my attachmentMimeType(name of att as text, rawMime)");
    }
    expect(readTemplate).toContain("my attachmentMimeType(attName, rawMime)");
    expect(readTemplate).toContain("MIME type of targetAttachment");
  });

  it("checks the same selected reference before creating the save temp directory or saving", () => {
    const selected = readTemplate.indexOf("set targetAttachment to att");
    const mime = readTemplate.indexOf("MIME type of targetAttachment");
    const guard = readTemplate.indexOf("my requireReadableAttachment(attName, attMime)");
    const temp = readTemplate.indexOf('do shell script "mktemp -d"');
    expect(selected).toBeGreaterThanOrEqual(0);
    expect(mime).toBeGreaterThan(selected);
    expect(guard).toBeGreaterThan(mime);
    expect(temp).toBeGreaterThan(guard);
    expect(readTemplate.indexOf("save targetAttachment in POSIX file tempPath")).toBeGreaterThan(temp);
  });
});

describe.skipIf(!onMacOS)("production attachment MIME helpers and transport fixtures, without Mail", () => {
  it("preserves every existing extension-to-MIME mapping", () => {
    const mappings = [
      ["pdf", "application/pdf"], ["doc", "application/msword"], ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      ["xls", "application/vnd.ms-excel"], ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
      ["ppt", "application/vnd.ms-powerpoint"], ["pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
      ["zip", "application/zip"], ["gz", "application/gzip"], ["tar", "application/x-tar"],
      ["jpg", "image/jpeg"], ["jpeg", "image/jpeg"], ["png", "image/png"], ["gif", "image/gif"], ["svg", "image/svg+xml"], ["webp", "image/webp"],
      ["mp3", "audio/mpeg"], ["mp4", "video/mp4"], ["mov", "video/quicktime"],
      ["txt", "text/plain"], ["csv", "text/csv"], ["html", "text/html"], ["htm", "text/html"], ["css", "text/css"], ["js", "application/javascript"],
      ["json", "application/json"], ["xml", "application/xml"], ["md", "text/markdown"], ["log", "text/plain"], ["ics", "text/calendar"], ["eml", "message/rfc822"],
      ["unknown", "application/octet-stream"],
    ];
    const output = run([
      'set resultJson to "["',
      ...mappings.map(([extension], index) => `set resultJson to resultJson & ${literal(index ? "," : "")} & "\\\"" & my escapeForJson(my attachmentMimeType(${literal(`File.${extension!.toUpperCase()}`)}, missing value)) & "\\\""`),
      'return resultJson & "]"',
    ].join("\n"));
    expect(JSON.parse(output)).toEqual(mappings.map(([, mime]) => mime));
  });

  it.each(["text/calendar", "TEXT/CALENDAR", " text/calendar ; charset=UTF-8 ", "text/x-custom+format", "text/x-{custom}", "application/json", "Application/XML; charset=utf-8", "\tapplication/x-yaml\t"])("admits %j on a previously unsupported filename", (mime) => {
    expect(admission("attachment.unknown", literal(mime))).toMatchObject({ accepted: true, mime });
  });

  it.each([".txt", ".csv", ".json", ".html", ".md", ".xml", ".log"])("preserves %s extension compatibility despite binary MIME", (extension) => {
    expect(admission(`File${extension.toUpperCase()}`, '"application/octet-stream"')).toMatchObject({ accepted: true });
  });

  it.each(["missing value", '"missing value"', '""', '" \t "'])("uses the existing calendar fallback for %s", (mime) => {
    expect(admission("calendar.ICS", mime)).toEqual({ accepted: true, mime: "text/calendar" });
  });

  it.each(["text/", "textual/plain", "text//plain", "text/plain/extra", "text/pla in", "text/ümlaut", "text/plain\n", "text/\u0000plain", "text/plain; charset=utf-8\n", "text/plain\u007f", "application/jsonx", "application/octet-stream", 'image/png; text/plain', 'text/plain\"},\"injected\":true'])("rejects invalid or binary MIME %j without a legacy extension", (mime) => {
    const result = admission("attachment.bin", literal(mime)) as { error: string };
    expect(result.error).toContain(mime);
    expect(result.error).toContain("save_attachment");
    expect(result).not.toHaveProperty("accepted");
  });

  it("admits extensionless attachments from MIME and rejects unavailable/unknown MIME with its fallback", () => {
    expect(admission("README", '"text/plain"')).toMatchObject({ accepted: true });
    expect(admission("README", "missing value")).toMatchObject({ error: expect.stringContaining("application/octet-stream") });
  });

  it.each(['text/plain; note="👩‍💻"', 'text/plain; note="re\u0301sume\u0301"', 'text/plain; note="quote\\\"\u0301"'])("accepts ignored Unicode parameters without normalization: %j", (mime) => {
    expect(admission("attachment.bin", literal(mime))).toEqual({ accepted: true, mime });
    expect(readFlow({ name: "attachment.bin", mime: literal(mime) })).toMatchObject({
      result: { name: "attachment.bin", content: expect.any(String) }, saved: true, madeTemp: true, leakedTemp: false,
    });
  });

  it.each(["text/plai\u0301n", "text/👩‍💻", 'text/plai\u0301n"},"injected":true', 'text/plain; note="👩‍💻\u0001"', 'text/plain; note="re\u0301sume\u0301\n"'])("rejects %j through escaped MIME-bearing JSON before saving", (mime) => {
    const flow = readFlow({ name: "attachment.bin", mime: literal(mime) });
    expect(flow).toMatchObject({ saved: false, madeTemp: false, leakedTemp: false });
    expect(flow.result).toEqual({
      error: `Inline reading is not supported for MIME type ${mime}. Use save_attachment instead.`, errorNumber: -2700,
    });
  });

  it.each(["", "a", "/", ";", "\u0301", "👩‍💻"])("handles an empty or single-character MIME base %j without coercion errors", (mime) => {
    expect(run(`return my isInlineTextMime(${literal(mime)})`)).toBe("false");
  });

  it("does not leak text delimiters or inherit case-sensitive comparison", () => {
    expect(run('set AppleScript\'s text item delimiters to "|"\nconsidering case\nmy requireReadableAttachment("unknown", "TeXt/Calendar; charset=UTF-8")\nend considering\nreturn AppleScript\'s text item delimiters as text')).toBe("|");
  });

  it.each(files)("%s serializes native and fallback MIME through its production metadata loop", (file) => {
    for (const [mime, getterError, expected] of [[literal('text/calendar; note="quoted"'), false, 'text/calendar; note="quoted"'], ["missing value", false, "text/calendar"], ['"ignored"', true, "text/calendar"]] as const) {
      expect(metadata(file, 'calendar "quoted" \\ 😀.ics', mime, getterError)).toEqual([{ name: 'calendar "quoted" \\ 😀.ics', mimeType: expected, fileSize: 400, downloaded: true }]);
    }
  });

  it.each([{}, { mime: "missing value" }, { getterError: true }, { name: "README", mime: '"application/json"' }])("reads admitted selected attachments and preserves UTF8/JSON/cleanup: %j", (options) => {
    const flow = readFlow(options);
    expect(flow).toMatchObject({ saved: true, madeTemp: true, leakedTemp: false });
    expect(flow.result).toEqual({ name: options.name ?? "calendar.ics", content: 'BEGIN:VCALENDAR\r\nSUMMARY: café "quoted" \\ 😀\r\nEND:VCALENDAR\r\n\n' });
  });

  it("rejects binary MIME through production error JSON before saving", () => {
    const flow = readFlow({ name: "bad.bin", mime: literal('application/octet-stream; note="quoted" \\ 😀') });
    expect(flow).toMatchObject({ saved: false, madeTemp: false, leakedTemp: false });
    expect(flow.result).toMatchObject({ error: expect.stringContaining('application/octet-stream; note="quoted" \\ 😀'), errorNumber: expect.any(Number) });
  });

  it.each([{ missing: true }, { downloaded: false }, { nameError: true }])("fails before save-temp creation for %j", (options) => {
    expect(readFlow(options)).toMatchObject({ result: { error: expect.any(String) }, saved: false, madeTemp: false, leakedTemp: false });
  });

  it.each([{ saveError: true }, { readError: true }])("propagates %j and removes the native save directory", (options) => {
    expect(readFlow(options)).toMatchObject({ result: { error: expect.any(String), errorNumber: expect.any(Number) }, saved: true, madeTemp: true, leakedTemp: false });
  });
});
