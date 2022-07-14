# `@remix-run/react`

## 1.6.5

### Patch Changes

- We enhanced the type signatures of `loader`/`action` and `useLoaderData`/`useActionData` to make it possible to infer the data type from return type of its related server function.

  ```tsx
  import type { LoaderArgs } from "@remix-run/[runtime]";

  export async function loader(args: LoaderArgs) {
    return json({ greeting: "Hello!" }); // TypedResponse<{ greeting: string }>
  }

  export default function App() {
    let data = useLoaderData<typeof loader>(); // { greeting: string }
    return <div>{data.greeting}</div>;
  }
  ```

  See the discussion in [#1254](https://github.com/remix-run/remix/pull/1254) for more context.

- Add `WebSocket` reconnect to `LiveReload`
