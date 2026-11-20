const ITEMS = ['specs', 'hooks', 'steering', 'MCP', 'power', 'custom agent', 'property tests'] as const;

export function Footer() {
  return (
    <footer className="foot">
      Built with Kiro:{' '}
      {ITEMS.map((item) => (
        <span key={item}>{item}</span>
      ))}
      <a className="foot-notice" href="./THIRD_PARTY_NOTICES.txt">
        Third-party notices
      </a>
    </footer>
  );
}
