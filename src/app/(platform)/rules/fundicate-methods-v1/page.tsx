import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Link from "next/link";
export const dynamic = "force-static";
export default async function PublishedMethodRules() {
  const specification = await readFile(
    join(process.cwd(), "public/rules/fundicate-methods-v1.txt"),
    "utf8",
  );
  return (
    <article className="panel padded">
      <span className="eyebrow">PUBLISHED RULES · FUNDICATE_METHODS_V1</span>
      <h1>Election methods and allocation rules</h1>
      <p>
        New V4 rounds commit to this version before collecting contributions.
        The method, seats, weights, quorum and allocation chosen for an
        individual round appear on that round. These rules explain how those
        choices are counted.
      </p>
      <p>
        <Link href="/rules/fundicate-methods-v1.txt">
          Read or save the original specification text
        </Link>
      </p>
      <pre className="method-specification">{specification}</pre>
    </article>
  );
}
