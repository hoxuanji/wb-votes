import { Shell } from "../../../components/iei/Shell.tsx";
import { EmptyState } from "../../../components/iei/parts.tsx";
import "../../iei.css";

export default function PersonNotFound() {
  return (
    <Shell here="person" reading>
      <EmptyState
        title="No person in the registry has that identifier."
        detail={
          <>
            A person URL is the registry&rsquo;s own id — a name slug plus six hex characters, as in{" "}
            <code>/p/pulak-roy-0d657a</code>. Ids change when entity resolution merges two rows, and the
            absorbed id stops resolving. Search by name in the bar above.
          </>
        }
      />
    </Shell>
  );
}
