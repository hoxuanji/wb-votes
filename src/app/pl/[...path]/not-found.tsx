
export default function PlaceNotFound() {
  // <article>, not <main>: the untouched root layout owns the page's one <main>.
  return (
    <article className="wrap">
      <p className="crumbs">Mandate · place</p>
      <p className="verdict">No place in the registry sits at that path.</p>
      <p className="caveat">
        A place URL is state, then district, then constituency:{" "}
        <code>/pl/wb/cooch-behar/mekliganj</code> — or the seat&rsquo;s number,{" "}
        <code>/pl/wb/cooch-behar/1</code>. The district in the path has to be the one the seat is
        actually in, so a real seat under the wrong district does not resolve. A state or a district
        has a brief of its own: <a className="body-link" href="/pl/wb">West Bengal</a>.
      </p>
    </article>
  );
}
