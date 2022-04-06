import type { LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";

import type { User } from "~/data.server";

interface LoaderData {
  users: User[];
}

export const loader: LoaderFunction = async ({ context }) => {
  const users = await context.loaders.usersById.loadMany([
    "ef3fcb93-0623-4d10-adbf-4dd865d6688c",
    "2cbad877-2da6-422d-baa6-c6a96a9e085f",
  ]);
  return json({ users });
};

export default function UserNames() {
  const { users } = useLoaderData<LoaderData>();

  return (
    <article>
      <h1>Users</h1>
      <ul>
        {users.map((user) => (
          <li key={user.email}>{user.name}</li>
        ))}
      </ul>
      <Outlet />
    </article>
  );
}
