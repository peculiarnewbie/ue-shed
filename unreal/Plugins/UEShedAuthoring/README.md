# UEShedAuthoring

The separately enabled editor capability for live DataTable snapshots, bounded transactional Apply,
operation-result lookup, and explicit Save. Its reflected functions carry the shared versioned JSON
contract over stock Remote Control. Apply preflights semantic fingerprints, supports the five
canonical command shapes across several tables, restores every table if any command fails, and keeps
a bounded operation-result cache so clients never need to replay uncertain mutation.
