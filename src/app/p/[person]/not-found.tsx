import { Shell } from "../../../components/iei/Shell.tsx";
import { EmptyState } from "../../../components/iei/parts.tsx";
import "../../iei.css";

export default function PersonNotFound() {
  return (
    <Shell here="person" reading>
      <EmptyState
        title="No person in the registry has that identifier."
        detail={
          <>Search by name in the bar above.</>
        }
      />
    </Shell>
  );
}
