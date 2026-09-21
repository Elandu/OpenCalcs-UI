import Link from "next/link";

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="OpenCalcs home">
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span>OpenCalcs</span>
    </Link>
  );
}
