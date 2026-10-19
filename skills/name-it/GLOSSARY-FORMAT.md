# Glossary format

## One context

The glossary file (whatever path this repo resolves) opens with the context
it covers, then its terms:

```markdown
# Fulfilment

Turns paid orders into parcels that leave the warehouse.

## Terms

**Shipment**:
One parcel with its own tracking number. An order may produce several.
_Not_: package, delivery

**Pick list**:
The items a picker collects for one shipment, in walking order.
_Not_: order lines, manifest

**Backorder**:
An order line waiting on stock that has not arrived.
_Not_: pending item, out-of-stock order
```

Rules:

- **Pick one word per concept.** Synonyms go on the `_Not_:` line so they
  stop being used.
- **Say what it is,** in one or two sentences, not what code does with it.
- **Domain terms only.** Words every program has (retry, cache, handler)
  stay out, however often the code uses them.
- **Group under subheadings** once clear clusters appear; a flat list is fine
  until then.

## Several contexts

A `GLOSSARY-MAP.md` at the repo root names each context, where its glossary
lives, and how the contexts depend on each other:

```markdown
# Glossary map

## Contexts

- [Checkout](./src/checkout/GLOSSARY.md): takes and pays for orders
- [Fulfilment](./src/fulfilment/GLOSSARY.md): turns paid orders into shipments

## Relationships

- **Checkout → Fulfilment**: publishes `OrderPaid`; Fulfilment starts picking
- **Fulfilment → Checkout**: publishes `ShipmentSent`; Checkout emails the customer
```

Which layout applies:

- a `GLOSSARY-MAP.md` exists: read it and work in the context the topic
  belongs to; if that is unclear, ask;
- only one glossary file exists: one context;
- neither exists: create the single glossary at the resolved path when the
  first term settles.
