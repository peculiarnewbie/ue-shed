# UEShedCore

The separately enabled editor capability for producer identity, health, and capability discovery.
It exposes a small reflected JSON manifest that stock Remote Control clients can query without
knowing authoring implementation object paths.

The editor-only `UEShedCoreEditor` companion advertises `editor.play-session.v1`. It observes and
controls one local Play In Editor or Simulate In Editor session in the active level viewport through
the versioned play-session JSON contract. The runtime module remains free of editor dependencies.
