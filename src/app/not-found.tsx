import Link from 'next/link';
import { Shell } from '../components/iei/Shell.tsx';
import { EmptyState } from '../components/iei/parts.tsx';
import './iei.css';

/**
 * The 404 of every address that names nothing: a state, a district, an election or a seat the registry does not
 * hold, a trimmed address, a path no route has. A route calls `notFound()` and this answers, with the product's header
 * and its search field, so a reader who has hit a dead end has a way out of it.
 *
 * It is here, at the root, because it began as a file beside the legacy /pl route and moved into a private folder,
 * which Next does not read, and for a while every miss got the framework's bare page instead. `/p/[person]` has a 404
 * of its own, for what it is able to say about a person's address.
 *
 * It cannot say WHICH address was asked: Next hands a not-found page no props.
 */

export const metadata = { title: 'No page at that address' };

export default function NotFound() {
  return (
    <Shell here="place" reading>
      <EmptyState
        title="No page sits at that address."
        detail={
          <>
            Search by name in the bar above, or <Link href="/">start from the front page</Link>.
          </>
        }
      />
    </Shell>
  );
}
