# 02. Ontology: The Universal Studio Ontology

> **Revision note.** This document previously described the kernel/module split
> and, before that, a polymorphic `Person` model. Those are not wrong, but they
> answered a different question — *how is the system composed?* That question now
> lives in [00-FRAMEWORK](00-FRAMEWORK.md) and [03-KERNEL_SPEC](03-KERNEL_SPEC.md).
>
> This revision answers the question the system was actually founded on and had
> never answered: **what is a service?** Everything here was derived in a long
> reasoning session; this document carries the derivations, not only the
> conclusions, because the previous summary lost them and the losses were
> expensive — see *Reasoning history* at the end.

---

## 0. The founding complaint

> "We haven't really defined exactly what a service is. We have merely been
> mumbling and juggling things around with no proper target."

Every confusion downstream — categories that don't sort, packages that behave
like services, deliverables that turn out to be services — traces to that one
undefined term. This document exists to fix it, and every section should be
readable as a consequence of the definition below.

---

## 1. What a service is

> **A service is an organized process performed by one party that transforms
> something of value for another party.**

Each clause is load-bearing:

| Clause | Why it is there |
|---|---|
| *organized process* | Not a moment or an object — something carried out. |
| *performed by one party* | Someone is accountable for it. |
| *transforms* | The core identity. Change the transformation, change the service. |
| *something of value* | A moment, an object, information, a memory, a legal status, a digital asset. |
| **for another party** | **Without this, this defines a function, not a service.** A workflow stage also consumes and produces. What makes something a service is that it is done *for someone else*. |

Earlier formulations required the process to be "seen and felt in the physical
world" and to involve "collaboration between all parties." Both were **too
narrow** — cloud hosting, online tutoring and AI retouching are services under
neither. They were generalized, not discarded: perceptibility and collaboration
remain *typical* of studio work and are useful defaults in Service Knowledge.

**The transformation test follows directly.** Printing is a separate service from
Photography because it performs a different transformation (digital image →
physical print), not because it produces a different deliverable. This is why a
print shop can exist without a photography studio.

---

## 2. Three planes, not a hierarchy

> **Do not encode a studio's reality as a single hierarchy when the reality
> itself is relational.**

The same capabilities are viewed three ways. None owns the others.

| Plane | Question it answers |
|---|---|
| **Semantic** | What exists, and what does it mean? |
| **Production** | How is it made, and what came from what? |
| **Commercial** | How is it sold? |

The reason this must be planes and not ownership is a single sentence from the
derivation: a package makes a service into **"a product that still is a
service."** Commercial framing must not overwrite operational reality. If
Package owned Service, it would.

---

## 3. The spine

```
STUDIO
  └── STUDIO CAPABILITY        the studio's relationship to a parent
        └── SERVICE PARENT     Photography, Videography, Printing, Design
              └── SERVICE      Portrait Photography, Event Videography, Framing
                    └── CONFIGURATION SCHEMA   what may vary, under what rules
                          └── PACKAGE    a priced selection, possibly cross-parent
                                └── BOOKING   what this client actually engaged
```

A studio **chooses its service parents**, **selects services** within them,
**builds packages** from those services, and **accepts bookings** against those
packages. That is the whole spine, and every other section is detail hung on it.

**Studio Capability** is a relationship carrying its own information — status,
public/private, since, configuration. There is a difference between "Photography
exists in the system" and "this studio provides Photography, publicly, since
2024." A bare edge cannot say that.

**Service Parent** is the identity layer. A studio that adds Videography *becomes*
a videography studio; its public identity is therefore **derivable from
structure**, not typed into a field. A studio is one business composed of several
service businesses, and its strength is the infrastructure connecting them.

**Service Parent is not a classification.** Photography is a parent. Wedding is a
dimension value. They must never share a layer.

---

## 4. Classification: why dimensions exist

The founding observation: *Fashion Photography* and *Birthday Photography* do
not feel like the same kind of category — and that intuition is correct, because
they answer different questions.

| Question | Dimension | Example values |
|---|---|---|
| What is being worked on? | **Subject** | Person, Product, Property, Landscape |
| On what occasion? | **Occasion** | Wedding, Birthday, Maternity |
| Under what conditions? | **Context / Environment** | Studio, Outdoor, Aerial, Underwater |
| To what end? | **Purpose** | Identity document, Advertising, Editorial, Memory |
| For whom? | **Client type** | Individual, Family, Business, Institution |
| In what manner? | **Style** | Documentary, Posed, Fine art, Lifestyle |
| By what means? | **Production method** | Film, Digital, Drone, Macro, 360° |

### Categories are projections

A category is not a property of an object. It is **the answer an object gives to
a particular classification question.**

One engagement has a subject, an occasion, a purpose, a client, a location and a
style simultaneously. Asking "group by Occasion" returns *Birthday*; asking
"group by Purpose" returns *Memory*. Nothing about the engagement changed — only
the question. A cube has many faces; a shadow shows one. **Every classification
is a shadow of a richer reality**, which is why choosing one dimension flattens
the others and why no dimension may own the object.

This is the whole justification for having dimensions rather than one `category`
field. Without it, the next reader collapses them back.

### A dimension is not a tag

`Wedding` is a tag. `Occasion → Wedding` is a dimension value. The second has
type, relationships, constraints and room to grow. A dimension is:

> a structured domain of possible variation that a service recognizes as
> meaningful — with a name, values, hierarchy where applicable, relationships,
> constraints, compatibility rules, and extensibility.

Adding *Naming Ceremony* must extend the Occasion dimension. It must **not**
require inventing a service called Naming Ceremony Photography. The service did
not change; the configuration space grew.

### Dimensions have two different internal shapes

This distinction is not yet built and is the sharpest open problem:

**Hierarchy** — Subject → Person → Individual / Couple / Family. A value has one
parent. `parent_id` handles this, and it exists.

**Facets** — Location decomposes into *Environment*, *Ownership*, *Specific
place*, *Geography*. "Lekki Beach" is simultaneously outdoor, third-party-owned,
a specific place, and in Lagos. These are orthogonal, and **`parent_id` cannot
express them.**

Location is also the dimension that most resists being one dimension at all. It
has been decomposed twice in the derivation, along different cuts:

```
service environment  →  what environments can this service be performed in?
studio facility      →  which of those does this studio operate?
booking location     →  where is this particular engagement happening?
```

Treat "Location" as a bundle wearing one name until this is resolved.

---

## 5. The proliferation rule

> **A dimension value never becomes a service.**

Services are what a studio selects within a parent: *Portrait Photography*,
*Event Photography*, *Event Videography*, *Fine Art Printing*, *Framing*, *Photo
Restoration*. Those are the units. This rule governs what happens **below** them.

Adding an occasion must extend the Occasion dimension. It must **not** mint a
service:

```
Event Photography + Occasion: Wedding      ✔  a configured service
Wedding Photography                        ✘  a service per occasion
Event Photography + Context: Outdoor       ✔
Outdoor Wedding Couple Photography         ✘  a service per combination
```

Without the rule, every new occasion, context or subject multiplies the
catalogue. With it, the catalogue stays the size of the studio's actual
capabilities and the variation lives in dimensions.

### Composite names are knowledge, not grounds for demotion

Many industry names compress several properties into one phrase:

```
Fashion Photography  ≈  Photography + Subject: Apparel + Purpose: Editorial
Wedding Photography  ≈  Event Photography + Occasion: Wedding + Client: Couple
```

Reading a name this way is what lets the system **suggest the right dimensions**,
**recognize a combination it has never seen**, and **generate a name** for a new
one — so that "luxury underwater maternity fashion photography" is understood as
a combination already in the vocabulary rather than a demand for a new category.

It is emphatically **not** a reason to dissolve the service. *Fashion
Photography* remains a service a studio selects and offers; the decomposition is
knowledge *about* it.

> **Earlier error, recorded.** A previous revision took the composite reading to
> its extreme, demoted Portrait/Event/Fashion Photography to non-services, and
> invented a "Configuration" entity to hold them. That was the proliferation rule
> applied one level too deep — it drew the line between *Capture* and *Portrait*
> rather than between *Event Photography* and *Wedding*. No such entity exists or
> is needed. See *Reasoning history*.

---

## 6. Knowledge

The system should not merely store structure. It should understand it well
enough to know **what to ask**.

> The system should not ask a question merely because the answer is possible. It
> should ask when the answer is necessary, relevant, unknown, or variable for
> this service and this engagement.

Anything else is bureaucracy — forcing the studio to describe reality from
scratch every time.

| Layer | What it knows |
|---|---|
| **Domain knowledge** | What is generally true of the medium. Photographic capture, image outputs, photographic workflow. |
| **Service knowledge** | What is true of this capability. Relevant dimensions, typical values, defaults, constraints. |
| **Dimension knowledge** | What dimensions mean and how they relate — *Wedding* commonly involves Couple, Venue, Event. |
| **Studio knowledge** | What *this* business does, overrides and extends. |
| **Booking facts** | What is true of this one engagement. Never used to define the layers above. |
| **Production knowledge** | *Emerging.* How work is actually executed. Not yet formalized. |

Knowledge is inherited and narrowed: Parent DNA → Service knowledge → Studio
overrides. Inheritance gives a child a **vocabulary, not a mandatory form** — a
service may recognize a dimension without requiring it.

---

## 7. Production plane

```
Inputs → Services → Outputs
```

**Services are transformative or generative.** Some create new assets from
reality (Capture); some transform existing assets (Retouching, Restoration,
Compositing). Both belong to the same parent.

**There are no "direct" versus "derived" outputs.** An output is an output; what
matters is its **provenance** — `produced_by` and `derived_from`. A printed
photograph is produced by Printing and derived from an edited photograph.

This replaces the earlier primary/secondary deliverable taxonomy, which was
correct in substance but wrong in form. It had to be relational because the
relation reverses by medium: **for film, the physical negative precedes the
digital file.** Any model that hardcodes "digital comes first" is wrong.

**Delivery containers** — gallery, Drive, USB, QR code — transport outputs
without transforming them. They cut across production and commerce and are
never services.

---

## 8. Commercial plane

> **A package is a commercial abstraction that groups one or more services into a
> single value proposition designed to simplify purchasing and communicate
> value.**

A package is not a service, a deliverable, or a process. Its purpose is selling.
It performs **perceptual work** — it is what moves a capability into something a
client can recognize and want. That is why it may bundle things with no natural
production relationship, and why it may cross service parents freely.

**Packages select; they never redefine.** Services define the possibility space
through their Configuration Schema. A package chooses values within it. A package
that invents a dimension the service does not recognize is a bug.

**Booking** instantiates a Package for a client and creates the production work.

---

## 9. Status: built, partial, proposed, open

| Concept | State |
|---|---|
| Service parents, domain DNA inheritance | **Built** |
| Services, transformative/generative | **Built** |
| Dimensions, hierarchical (`parent_id`) | **Built** |
| Output types, provenance (`assets.derived_from_asset_id`) | **Built** |
| Delivery containers | **Built** |
| Package selects dimensions / workflows | **Built** |
| Configuration Schema | **Partial** — `service_schema_*` records *which* dimensions, not "under what rules". No required/default/constraint. |
| **Service Variables** | **Not built.** Outfits, people, edited images, delivery speed have nowhere to live. A package cannot express `{Outfits: 2, Images: 5}`. |
| **Missing services in the seed library** | Photo Restoration, Retouching, Image Editing, Film Developing, Digitisation are real transformations a studio sells and none are offered. A studio that restores old photographs cannot express it. |
| **Studio Capability** | **Not built.** `Studio operates_in Parent` is a bare edge with no status/public/since. |
| Dimension **facets** (Location) | **Open problem.** Only hierarchy is expressible. |
| Workflows as branching graphs, matched by input/output compatibility | **Proposed, not derived.** This appears nowhere in the reasoning. Blueprints are linear ordered arrays. Treat as a proposal until argued for. |

---

## 10. Reasoning history

Preserved deliberately: the path to a concept carries information the final
formulation does not.

| Idea | Fate |
|---|---|
| Service = physically perceptible + collaborative | **Generalized** to transformation-for-another-party. Retained as typical studio defaults. |
| Service domain | **Renamed** to Service Parent — it is an identity, not a folder. |
| Primary / secondary deliverables | **Reframed** as provenance. Substance kept, form replaced. |
| "Category" as one field | **Replaced** by dimensions, on the projection argument. |
| Wedding/Fashion/Portrait Photography as services | **Retained as services.** Briefly demoted in a previous revision; reversed. They are what a studio selects. |
| Sub-services | **Dissolved** into dimensions. *Birthday portraits* is Portrait Photography + Occasion: Birthday, not a service. |
| "Configuration" as an entity | **Discarded.** Invented to hold what an over-applied proliferation rule had displaced. Once the rule is scoped correctly — dimension values never become services — nothing is displaced and nothing needs holding. |
| "Offering" | **Discarded.** It was a simile — *"packages are like product offerings"* — mistaken for an entity by an earlier reading. Package is the entity. |

**Both discarded entities failed the same test, in opposite directions:** one
promoted a figure of speech to a table, the other invented a table to catch
something a rule had knocked over. Before adding an entity, check whether it has
a derivation or is only patching a consequence.
