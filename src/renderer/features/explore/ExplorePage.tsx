import { Compass } from 'lucide-react';
import { EmptyState, PageHeader } from '../../components/ui';

/** The home screen. A placeholder until E1 builds the map, search and results. */
export default function ExplorePage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 lg:px-8">
      <PageHeader
        title="Explore"
        description="Places to stay across Western Australia, from every provider in one place."
      />
      {/* An h2 at section size, under the page's h1 "Explore". */}
      <EmptyState
        className="mt-8"
        icon={<Compass size={24} />}
        accent="sun"
        headingLevel={2}
        size="md"
        title="The map is on its way"
        description="Search places to stay and browse them on a map."
      />
    </div>
  );
}
