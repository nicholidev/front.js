import path from "path";
import fs from "fs/promises";
import fse from "fs-extra";
import cp from "child_process";
import { sync as spawnSync } from "cross-spawn";
import type { Writable } from "stream";
import puppeteer from "puppeteer";
import type { Page, HTTPResponse } from "puppeteer";
import express from "express";
import cheerio from "cheerio";
import prettier from "prettier";
import getPort from "get-port";
import stripIndent from "strip-indent";
import chalk from "chalk";

import type { ServerBuild } from "../../packages/remix-server-runtime";
import { createRequestHandler } from "../../packages/remix-server-runtime";
import { createRequestHandler as createExpressHandler } from "../../packages/remix-express";
import { TMP_DIR } from "./global-setup";

interface FixtureInit {
  buildStdio?: Writable;
  sourcemap?: boolean;
  files: { [filename: string]: string };
  template?: "cf-template" | "node-template";
}

export type Fixture = Awaited<ReturnType<typeof createFixture>>;
export type AppFixture = Awaited<ReturnType<typeof createAppFixture>>;

export const js = String.raw;
export const json = String.raw;
export const mdx = String.raw;
export const css = String.raw;

export async function createFixture(init: FixtureInit) {
  let projectDir = await createFixtureProject(init);
  let buildPath = path.resolve(projectDir, "build");
  if (!fse.existsSync(buildPath)) {
    throw new Error(
      chalk.red(
        `Expected build directory to exist at ${chalk.dim(
          buildPath
        )}. The build probably failed. Did you maybe have a syntax error in your test code strings?`
      )
    );
  }
  let app: ServerBuild = await import(buildPath);
  let handler = createRequestHandler(app, "production");

  let requestDocument = async (href: string, init?: RequestInit) => {
    let url = new URL(href, "test://test");
    let request = new Request(url.toString(), init);
    return handler(request);
  };

  let requestData = async (
    href: string,
    routeId: string,
    init?: RequestInit
  ) => {
    let url = new URL(href, "test://test");
    url.searchParams.set("_data", routeId);
    let request = new Request(url.toString(), init);
    return handler(request);
  };

  let postDocument = async (href: string, data: URLSearchParams | FormData) => {
    return requestDocument(href, {
      method: "POST",
      body: data,
      headers: {
        "Content-Type":
          data instanceof URLSearchParams
            ? "application/x-www-form-urlencoded"
            : "multipart/form-data",
      },
    });
  };

  let getBrowserAsset = async (asset: string) => {
    return fs.readFile(
      path.join(projectDir, "public", asset.replace(/^\//, "")),
      "utf8"
    );
  };

  return {
    projectDir,
    build: app,
    requestDocument,
    requestData,
    postDocument,
    getBrowserAsset,
  };
}

export async function createAppFixture(fixture: Fixture) {
  let startAppServer = async (): Promise<{
    port: number;
    stop: () => Promise<void>;
  }> => {
    return new Promise(async (accept) => {
      let port = await getPort();
      let app = express();
      app.use(express.static(path.join(fixture.projectDir, "public")));
      app.all(
        "*",
        createExpressHandler({ build: fixture.build, mode: "production" })
      );

      let server = app.listen(port);

      let stop = (): Promise<void> => {
        return new Promise((res) => {
          server.close(() => res());
        });
      };

      accept({ stop, port });
    });
  };

  let launchPuppeteer = async () => {
    let browser = await puppeteer.launch();
    let page = await browser.newPage();
    return { browser, page };
  };

  let start = async () => {
    let [{ stop, port }, { browser, page }] = await Promise.all([
      startAppServer(),
      launchPuppeteer(),
    ]);

    let serverUrl = `http://localhost:${port}`;

    return {
      /**
       * The puppeteer "page" instance. You will probably need to interact with
       * this quite a bit in your tests, but our hope is that we can identify
       * the most common things we do in our tests and make them helpers on the
       * FixtureApp interface instead. Maybe one day we'll want to use cypress,
       * would be nice to have an abstraction around our headless browser.
       *
       * For example, our `fixture.goto` wraps the normal `page.goto` but waits
       * for hydration. As a rule of thumb, if you do the same handful of
       * operations on the `page` three or more times, it's probably a good
       * candidate to be a helper on `FixtureApp`.
       *
       * @see https://pptr.dev/#?product=Puppeteer&version=v13.1.3&show=api-class-page
       */
      page,

      /**
       * The puppeteer browser instance, seems unlikely we'll need it in tests,
       * but maybe we will, so here it is.
       */
      browser,

      /**
       * Closes the puppeteer browser and fixture app, **you need to call this
       * at the end of a test** or `afterAll` if the fixture is initialized in a
       * `beforeAll` block. Also make sure to `await app.close()` or else you'll
       * have memory leaks.
       */
      close: async () => {
        return Promise.all([browser.close(), stop()]);
      },

      /**
       * Visits the href with a document request.
       *
       * @param href The href you want to visit
       * @param waitForHydration Will wait for the network to be idle, so
       * everything should be loaded and ready to go
       */
      goto: async (href: string, waitForHydration?: true) => {
        return page.goto(`${serverUrl}${href}`, {
          waitUntil: waitForHydration ? "networkidle0" : undefined,
        });
      },

      /**
       * Finds a link on the page with a matching href, clicks it, and waits for
       * the network to be idle before continuing.
       *
       * @param href The href of the link you want to click
       * @param options `{ wait }` waits for the network to be idle before moving on
       */
      clickLink: async (
        href: string,
        options: { wait: boolean } = { wait: true }
      ) => {
        let selector = `a[href="${href}"]`;
        let el = await page.$(selector);
        if (!el) {
          throw new Error(`Could not find link for ${selector}`);
        }
        if (options.wait) {
          await doAndWait(page, () => el.click());
        } else {
          await el.click();
        }
      },

      /**
       * Find the input element and fill for file uploads.
       * @param inputSelector The selector of the input you want to fill
       * @param filePaths The paths to the files you want to upload
       */
      uploadFile: async (inputSelector: string, ...filePaths: string[]) => {
        let el = await page.$(inputSelector);
        if (!el) {
          throw new Error(`Could not find input for: ${inputSelector}`);
        }
        await el.uploadFile(...filePaths);
      },

      /**
       * Finds the first submit button with `formAction` that matches the
       * `action` supplied, clicks it, and optionally waits for the network to
       * be idle before continuing.
       *
       * @param action The formAction of the button you want to click
       * @param options `{ wait }` waits for the network to be idle before moving on
       */
      clickSubmitButton: async (
        action: string,
        options: { wait: boolean; method?: string } = { wait: true }
      ) => {
        let selector: string;
        if (options.method) {
          selector = `button[formAction="${action}"][formMethod="${options.method}"]`;
        } else {
          selector = `button[formAction="${action}"]`;
        }

        let el = await page.$(selector);
        if (!el) {
          if (options.method) {
            selector = `form[action="${action}"] button[type="submit"][formMethod="${options.method}"]`;
          } else {
            selector = `form[action="${action}"] button[type="submit"]`;
          }
          el = await page.$(selector);
          if (!el) {
            throw new Error(`Can't find button for: ${action}`);
          }
        }
        if (options.wait) {
          await doAndWait(page, () => el.click());
        } else {
          await el.click();
        }
      },

      /**
       * Clicks any element and waits for the network to be idle.
       */
      clickElement: async (selector: string) => {
        let el = await page.$(selector);
        if (!el) {
          throw new Error(`Can't find element for: ${selector}`);
        }
        await doAndWait(page, () => el.click());
      },

      /**
       * Perform any interaction and wait for the network to be idle:
       *
       * ```js
       * await app.waitForNetworkAfter(() => app.page.focus("#el"))
       * ```
       */
      waitForNetworkAfter: async (fn: () => Promise<unknown>) => {
        await doAndWait(page, fn);
      },

      /**
       * "Clicks" the back button and optionally waits for the network to be
       * idle (defaults to waiting).
       */
      goBack: async (options: { wait: boolean } = { wait: true }) => {
        if (options.wait) {
          await doAndWait(page, () => page.goBack());
        } else {
          await page.goBack();
        }
      },

      /**
       * Collects data responses from the network, usually after a link click or
       * form submission. This is useful for asserting that specific loaders
       * were called (or not).
       */
      collectDataResponses: () => collectDataResponses(page),

      /**
       * Collects all responses from the network, usually after a link click or
       * form submission. A filter can be provided to only collect responses
       * that meet a certain criteria.
       */
      collectResponses: (filter?: UrlFilter) => collectResponses(page, filter),

      /**
       * Disables JavaScript for the page, make sure to enable it again by
       * calling and awaiting the returned function!
       *
       * ```js
       * let enable = await app.disableJavaScript();
       * // tests
       * await enable();
       * ```
       */
      disableJavaScript: async () => {
        await page.setRequestInterception(true);
        let handler = (request: puppeteer.HTTPRequest) => {
          if (request.resourceType() === "script") request.abort();
          else request.continue();
        };
        page.on("request", handler);

        return async () => {
          await page.setRequestInterception(false);
          page.off("request", handler);
        };
      },

      /**
       * Get HTML from the page. Useful for asserting something rendered that
       * you expected.
       *
       * @param selector CSS Selector for the element's HTML you want
       */
      getHtml: (selector?: string) => getHtml(page, selector),

      /**
       * Get a cheerio instance of an element from the page.
       *
       * @param selector CSS Selector for the element's HTML you want
       */
      getElement: async (selector: string) => {
        return getElement(await getHtml(page), selector);
      },

      /**
       * Keeps the fixture running for as many seconds as you want so you can go
       * poke around in the browser to see what's up.
       *
       * @param seconds How long you want the app to stay open
       */
      poke: async (seconds: number = 10, href: string = "/") => {
        let ms = seconds * 1000;
        jest.setTimeout(ms);
        console.log(`🙈 Poke around for ${seconds} seconds 👉 ${serverUrl}`);
        cp.exec(`open ${serverUrl}${href}`);
        return new Promise((res) => setTimeout(res, ms));
      },
    };
  };

  return start();
}

////////////////////////////////////////////////////////////////////////////////
export async function createFixtureProject(init: FixtureInit): Promise<string> {
  let template = init.template ?? "node-template";
  let integrationTemplateDir = path.join(__dirname, template);
  let projectName = `remix-${template}-${Math.random().toString(32).slice(2)}`;
  let projectDir = path.join(TMP_DIR, projectName);

  await fse.ensureDir(projectDir);
  await fse.copy(integrationTemplateDir, projectDir);
  await fse.copy(
    path.join(__dirname, "../../build/node_modules"),
    path.join(projectDir, "node_modules"),
    { overwrite: true }
  );
  await renamePkgJsonApp(projectDir);
  await writeTestFiles(init, projectDir);
  build(projectDir, init.buildStdio, init.sourcemap);

  return projectDir;
}

function build(projectDir: string, buildStdio?: Writable, sourcemap?: boolean) {
  let buildArgs = ["node_modules/@remix-run/dev/cli.js", "build"];
  if (sourcemap) {
    buildArgs.push("--sourcemap");
  }
  let buildSpawn = spawnSync("node", buildArgs, {
    cwd: projectDir,
  });
  if (buildStdio) {
    buildStdio.write(buildSpawn.stdout.toString("utf-8"));
    buildStdio.write(buildSpawn.stderr.toString("utf-8"));
    buildStdio.end();
  }
}

async function writeTestFiles(init: FixtureInit, dir: string) {
  await Promise.all(
    Object.keys(init.files).map(async (filename) => {
      let filePath = path.join(dir, filename);
      await fse.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, stripIndent(init.files[filename]));
    })
  );
}

/**
 * This prevents the console for spitting out a bunch of junk like this for
 * every fixture:
 *
 *    jest-haste-map: Haste module naming collision: remix-app-template-js
 *
 * I found some github issues that says that `modulePathIgnorePatterns` should
 * help, so I added it to our `jest.config.js`, but it doesn't seem to help, so
 * I brute-forced it here.
 */
async function renamePkgJsonApp(dir: string) {
  let pkgPath = path.join(dir, "package.json");
  let pkg = await fs.readFile(pkgPath);
  let obj = JSON.parse(pkg.toString());
  obj.name = path.basename(dir);
  await fs.writeFile(pkgPath, JSON.stringify(obj, null, 2) + "\n");
}

export async function getHtml(page: Page, selector?: string) {
  let html = await page.content();
  return selector ? selectHtml(html, selector) : prettyHtml(html);
}

export function getAttribute(
  source: string,
  selector: string,
  attributeName: string
) {
  let el = getElement(source, selector);
  return el.attr(attributeName);
}

export function getElement(source: string, selector: string) {
  let el = cheerio(selector, source);
  if (!el.length) {
    throw new Error(`No element matches selector "${selector}"`);
  }
  return el;
}

export function selectHtml(source: string, selector: string) {
  let el = getElement(source, selector);
  return prettyHtml(cheerio.html(el)).trim();
}

export function prettyHtml(source: string): string {
  return prettier.format(source, { parser: "html" });
}

// Taken from https://github.com/puppeteer/puppeteer/issues/5328#issuecomment-986175620
// Seems to work?
async function doAndWait(
  page: puppeteer.Page,
  fun: () => Promise<unknown>,
  pollTime: number = 20,
  timeout: number = 2000
) {
  let waiting: puppeteer.HTTPRequest[] = [];

  await page.setRequestInterception(true);
  let onRequest = (interceptedRequest: puppeteer.HTTPRequest) => {
    interceptedRequest.continue();
    waiting.push(interceptedRequest);
  };
  page.on("request", onRequest);

  await fun();

  let pollEvent: NodeJS.Timer;
  let timeoutEvent: NodeJS.Timer;
  return new Promise((res, rej) => {
    let clear = () => {
      clearInterval(pollEvent);
      clearTimeout(timeoutEvent);
      page.off("request", onRequest);
      return page.setRequestInterception(false);
    };
    timeoutEvent = setTimeout(() => {
      console.warn("Warning, wait for the address below to time out:");
      console.warn(waiting.map((a) => a.url()).join("\n"));
      return clear().then(() => res(null));
    }, timeout);
    pollEvent = setInterval(() => {
      if (waiting.length == 0) {
        return clear().then(() => res(null));
      }
      waiting = waiting.filter((a) => a.response() == null);
    }, pollTime);
  });
}

type UrlFilter = (url: URL) => boolean;

export function collectResponses(
  page: Page,
  filter?: UrlFilter
): HTTPResponse[] {
  let responses: HTTPResponse[] = [];

  page.on("response", (res) => {
    if (!filter || filter(new URL(res.url()))) {
      responses.push(res);
    }
  });

  return responses;
}

export function collectDataResponses(page: Page) {
  return collectResponses(page, (url) => url.searchParams.has("_data"));
}
