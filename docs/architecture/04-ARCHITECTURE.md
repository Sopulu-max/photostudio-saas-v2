# 04. System Architecture

> **Fully superseded by [00-FRAMEWORK](00-FRAMEWORK.md).** This doc's
> two-layer sketch (a data-only "Production Engine" + a headless, generic
> "Ubiquitous Visual Engine" that painted every screen from bound blocks) was
> the design behind the no-code Builder. The Builder was built, used, and
> removed — it felt like a dataview, not a studio's own tool. There is no
> longer a generic visual engine layer at all: the UI is hardcoded pages per
> module, built deep on purpose, per [00-FRAMEWORK §2](00-FRAMEWORK.md).
>
> Kept only so the decision has a paper trail. Read 00 for the actual
> architecture; do not build against anything below this line.

The two-layer sketch this doc originally specified — a "Production Engine"
holding immutable data and a "Ubiquitous Visual Engine" rendering every
screen from data-bound blocks — is not how the system works today. See
[00-FRAMEWORK](00-FRAMEWORK.md) for the kernel + modules + views shape that
replaced it, and [02-ONTOLOGY](02-ONTOLOGY.md) / [03-KERNEL_SPEC](03-KERNEL_SPEC.md)
for the current data model.
