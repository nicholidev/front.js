export function loader() {
  throw new Error("I am a loader error!");
}

export default function LoaderErrorsNested() {
  return <div>Loader errors nested</div>;
}

export function ErrorBoundary({ error }) {
  return (
    <div data-test-id="/loader-errors/nested">
      <h2>Nested Error Boundary</h2>
      <p>
        There was an error at this specific route. The parent still renders
        cause it was fine, but this one blew up.
      </p>
      <pre>{error.message}</pre>
    </div>
  );
}
