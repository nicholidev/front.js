import type { LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";

import { auth, sessionStorage } from "~/auth.server";

type LoaderData = {
  error: { message: string } | null;
};

export const loader: LoaderFunction = async ({ request }) => {
  await auth.isAuthenticated(request, { successRedirect: "/private" });
  const session = await sessionStorage.getSession(
    request.headers.get("Cookie")
  );
  const error = session.get(auth.sessionErrorKey) as LoaderData["error"];
  return json<LoaderData>({ error });
};

export default function Screen() {
  const { error } = useLoaderData<LoaderData>();

  return (
    <Form method="post" action="/auth/github">
      {error ? <div>{error.message}</div> : null}
      <button>Sign In with GitHub</button>
    </Form>
  );
}
