import { describe, expect, test } from "bun:test";
import { containerView, fallbackView, type Context, type Quad, type Resource } from "../src/index.ts";

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const LDP_CONTAINER = "http://www.w3.org/ns/ldp#Container";
const LDP_CONTAINS = "http://www.w3.org/ns/ldp#contains";
const DC_MODIFIED = "http://purl.org/dc/terms/modified";

const iri = (value: string) => ({ termType: "NamedNode", value }) as const;
const q = (s: string, p: string, o: Quad["object"] | string): Quad => ({
  subject: iri(s),
  predicate: iri(p),
  object: typeof o === "string" ? iri(o) : o,
});

const noop: Context = {
  resolve: () => Promise.reject(new Error("no resolve")),
  emit: () => {},
  events: (async function* () {})(),
};

describe("containerView", () => {
  const root = "https://pod.example/notes/";
  const container: Resource = {
    iri: root,
    contentType: "text/turtle",
    body: "",
    meta: [
      q(root, RDF_TYPE, LDP_CONTAINER),
      q(root, LDP_CONTAINS, `${root}a.md`),
      q(root, LDP_CONTAINS, `${root}sub/`),
      q(`${root}sub/`, RDF_TYPE, LDP_CONTAINER),
      q(`${root}a.md`, DC_MODIFIED, {
        termType: "Literal",
        value: "2026-09-17T10:00:00Z",
        datatype: "http://www.w3.org/2001/XMLSchema#dateTime",
      }),
    ],
    allow: ["read"],
  };

  test("lists each child as a link with its name", async () => {
    const { html } = await containerView.render(container, noop);
    expect(html).toContain(`href="${root}a.md"`);
    expect(html).toContain(">a.md<");
    expect(html).toContain(`href="${root}sub/"`);
    expect(html).toContain(">sub/<");
  });

  test("marks child containers and shows modified where stated", async () => {
    const { html } = await containerView.render(container, noop);
    expect(html).toMatch(/<li[^>]*class="[^"]*\bis-container\b[^"]*"[^>]*>[\s\S]*sub\//);
    expect(html).toContain("2026-09-17T10:00:00Z");
  });

  test("escapes names", async () => {
    const r: Resource = {
      ...container,
      meta: [q(root, RDF_TYPE, LDP_CONTAINER), q(root, LDP_CONTAINS, `${root}a<b>.md`)],
    };
    const { html } = await containerView.render(r, noop);
    expect(html).not.toContain("<b>");
    expect(html).toContain("a&lt;b&gt;.md");
  });
});

describe("fallbackView", () => {
  test("renders a graph as statements grouped by subject with linked IRIs", async () => {
    const r: Resource = {
      iri: "https://pod.example/x.ttl",
      contentType: "text/turtle",
      body: "",
      graph: [
        q("https://pod.example/x.ttl#me", RDF_TYPE, "https://schema.org/Person"),
        q("https://pod.example/x.ttl#me", "https://schema.org/name", {
          termType: "Literal",
          value: "Toph",
          language: "de",
        }),
      ],
      meta: [],
      allow: ["read"],
    };
    const { html } = await fallbackView.render(r, noop);
    expect(html).toContain(`href="https://schema.org/Person"`);
    expect(html).toContain("Toph");
    expect(html.match(/<tbody/g)?.length ?? html.match(/class="subject"/g)?.length).toBe(1);
  });

  test("renders other text as preformatted, escaped", async () => {
    const r: Resource = {
      iri: "https://pod.example/x.txt",
      contentType: "text/plain",
      body: "<script>x</script>",
      meta: [],
      allow: ["read"],
    };
    const { html } = await fallbackView.render(r, noop);
    expect(html).toMatch(/^<pre/);
    expect(html).toContain("&lt;script&gt;");
  });

  test("renders binary as a download link", async () => {
    const r: Resource = {
      iri: "https://pod.example/x.bin",
      contentType: "application/octet-stream",
      body: new Uint8Array([1, 2, 3]),
      meta: [],
      allow: ["read"],
    };
    const { html } = await fallbackView.render(r, noop);
    expect(html).toContain(`href="https://pod.example/x.bin"`);
    expect(html).toContain("download");
  });
});
