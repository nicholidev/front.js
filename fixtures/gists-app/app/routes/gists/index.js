import { useRouteData } from "@remix-run/react";

let fakeGists = [
  {
    url: "https://api.github.com/gists/610613b54e5b34f8122d1ba4a3da21a9",
    id: "610613b54e5b34f8122d1ba4a3da21a9",
    files: {
      "remix-server.jsx": {
        filename: "remix-server.jsx"
      }
    },
    owner: {
      login: "ryanflorence",
      id: 100200,
      avatar_url: "https://avatars0.githubusercontent.com/u/100200?v=4"
    }
  }
];

export function loader() {
  if (process.env.NODE_ENV === "test") {
    return Promise.resolve(fakeGists);
  }

  return fetch(`https://api.github.com/gists`);
}

export function meta() {
  return {
    title: "Public Gists",
    description: "View the latest gists from the public"
  };
}

export default function GistsIndex() {
  let data = useRouteData();

  return (
    <div data-test-id="/gists/index">
      <h2>Public Gists</h2>
      <ul>
        {data.map(gist => (
          <li key={gist.id}>
            <a href={gist.html_url}>{Object.keys(gist.files)[0]}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
