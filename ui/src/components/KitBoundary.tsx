import { Component, type ComponentType, type ReactNode } from 'react';
import { Placeholder, type ComponentName } from './Placeholder';

interface BoundaryProps {
  readonly name: ComponentName;
  readonly children?: ReactNode;
}

interface BoundaryState {
  readonly failed: boolean;
}

/** Catches a throwing child and shows only the Placeholder. Nothing from the error is read or logged. */
export class KitBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  override render(): ReactNode {
    if (this.state.failed) return <Placeholder name={this.props.name} />;
    return this.props.children;
  }
}

/** Wrap a component so that a throw inside it yields the Placeholder of `name`. */
export function withBoundary<P extends object>(Inner: ComponentType<P>, name: ComponentName): ComponentType<P> {
  function Bounded(props: P) {
    return (
      <KitBoundary name={name}>
        <Inner {...props} />
      </KitBoundary>
    );
  }
  Bounded.displayName = `withBoundary(${name})`;
  return Bounded;
}
