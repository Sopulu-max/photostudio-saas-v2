# Reconciliation — New Framework × Old Docs × Current Code

> **Fully superseded by [00-FRAMEWORK](00-FRAMEWORK.md).** This document's
> job was to reconcile the old entity/visual-engine docs against a proposed
> new framework and recommend a direction: it concluded the highest-leverage
> next move was to grow the Builder/Renderer/`visual_layouts` seed into a
> full view-rendering engine ("Layer 3, the keystone").
>
> That recommendation was not the path taken. The Builder was built further,
> then removed entirely — it felt like a dataview, not a studio's own tool.
> The actual direction was the opposite of what this document argued for: a
> modular monolith with hardcoded pages per module, no generic view engine,
> no metadata registry, no automation-as-data. Every conclusion below is
> reasoning toward a decision that was made the other way.
>
> Kept only so the decision has a paper trail. Read
> [00-FRAMEWORK](00-FRAMEWORK.md) for the architecture actually in place, and
> [00-FRAMEWORK's revision note](00-FRAMEWORK.md) for why the Builder path
> was dropped.
