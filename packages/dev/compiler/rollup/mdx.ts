import { promises as fsp } from "fs";
import * as path from "path";
import cacache from "cacache";
import type { Plugin } from "rollup";
import parseFrontMatter from "front-matter";
import mdx from "@mdx-js/mdx";
import prettyMs from "pretty-ms";

import type { RemixConfig } from "./remixConfig";
import { getRemixConfig } from "./remixConfig";
import { getHash } from "../crypto";

const imports = `
import { mdx } from "@mdx-js/react";
`;

let regex = /\.mdx?$/;

interface RemixFrontMatter {
  meta?: { [name: string]: string };
  headers?: { [header: string]: string };
}

// They don't have types, so we could go figure it all out and add it as an
// interface here
export type MdxOptions = any;
export type MdxFunctionOption = (
  attributes: { [key: string]: any },
  filename: string
) => MdxOptions;

export type MdxConfig = MdxFunctionOption | MdxOptions;

/**
 * Loads .mdx files as JavaScript modules with support for Remix's `headers`
 * and `meta` route module functions as static object declarations in the
 * frontmatter.
 */
export default function mdxPlugin({
  mdxConfig: mdxConfigArg
}: {
  mdxConfig?: MdxConfig;
} = {}): Plugin {
  let config: RemixConfig;

  return {
    name: "mdx",

    async buildStart({ plugins }) {
      config = await getRemixConfig(plugins);
    },

    async load(id) {
      if (id.startsWith("\0") || !regex.test(id)) return null;

      let file = id;
      let source = await fsp.readFile(file, "utf-8");
      let hash = getHash(source).slice(0, 8);

      let code: string;
      try {
        let cached = await cacache.get(config.cacheDirectory, hash);
        code = cached.data.toString("utf-8");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;

        code = await generateRouteModule(
          file,
          source,
          mdxConfigArg || config.mdx
        );

        await cacache.put(config.cacheDirectory, hash, code);
      }

      return code;
    }
  };
}

async function generateRouteModule(
  file: string,
  source: string,
  mdxConfig: MdxConfig
): Promise<string> {
  let start = Date.now();

  let {
    body,
    attributes
  }: {
    body: string;
    attributes: RemixFrontMatter;
  } = parseFrontMatter(source);

  let code = imports;

  if (attributes && attributes.meta) {
    code += `export function meta() { return ${JSON.stringify(
      attributes.meta
    )}}\n`;
  }

  if (attributes && attributes.headers) {
    code += `export function headers() { return ${JSON.stringify(
      attributes.headers
    )}}\n`;
  }

  let mdxOptions =
    typeof mdxConfig === "function" ? mdxConfig(attributes, file) : mdxConfig;

  code += await mdx(body, mdxOptions);

  console.log(
    'Built MDX for "%s", %s',
    path.basename(file),
    prettyMs(Date.now() - start)
  );

  return code;
}
