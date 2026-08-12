import { Shell } from "../../../components/iei/Shell.tsx";
import { EmptyState } from "../../../components/iei/parts.tsx";
import "../../iei.css";

export default function PlaceNotFound() {
  return (
    <Shell here="place" reading>
      <EmptyState
        title="No place in the registry sits at that path."
        detail={
          <>
            A place URL is state, then district, then constituency —{" "}
            <code>/pl/ka/bagalkot/badami</code> — or the seat&rsquo;s number,{" "}
            <code>/pl/ka/bagalkot/21</code>. The district in the path has to be the one the seat is actually
            in, so a real seat under the wrong district does not resolve. Every state is on the map at{" "}
            <code>/</code>.
          </>
        }
      />
    </Shell>
  );
}
