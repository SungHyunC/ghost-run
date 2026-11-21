import { Sprite } from './components/art/Sprite';
import { Book } from './components/Book';
import { Costumes } from './components/Costumes';
import { Footer } from './components/Footer';
import { Hero } from './components/Hero';
import { Make } from './components/Make';
import { Nav } from './components/Nav';
import { PageBar } from './components/PageBar';
import { Recipe } from './components/Recipe';
import { Walkthrough } from './components/Walkthrough';
import { CopyPane } from './components/walk/CopyPane';
import { RealityPane } from './components/walk/RealityPane';
import runsJson from './data/runs.json';
import type { RunsFile } from './data/types';
import worldSize from './data/world-size.json';
import { roundLines } from './engine/format';
import { usePaging } from './engine/usePaging';

const runs = runsJson as unknown as RunsFile;
const LINE_COUNT = roundLines(worldSize.worlds['ghost-cloud']);

// Five Book_Pages: cover (hero), recipe, costumes, run, make (with the footer last).
export function App() {
  const paging = usePaging();
  const { state, visibility } = paging;
  return (
    <div className="site" {...paging.siteProps}>
      <Sprite />
      <div className="wrap">
        <Nav current="home" onHome={paging.onHome} />
        <Book
          pagesProps={paging.pagesProps}
          state={state}
          pages={{
            cover: <Hero />,
            recipe: <Recipe lineCount={LINE_COUNT} />,
            costumes: <Costumes visibility={visibility} />,
            run: (
              <Walkthrough
                runs={runs}
                visibility={visibility}
                renderReality={(record) => <RealityPane scene={record.reality} />}
                renderCopy={(record, view) => <CopyPane record={record} copy={view.copy} fixed={view.plan.rev} />}
              />
            ),
            make: (
              <>
                <Make />
                <Footer />
              </>
            ),
          }}
        />
      </div>
      <PageBar paging={paging} />
    </div>
  );
}
