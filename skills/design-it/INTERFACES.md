# Shaping an interface

Detail for [design-it](SKILL.md).

## Deep and shallow at a glance

```text
deep                              shallow
+-----------+                     +-----------------------------+
| narrow    |  few entry points   | wide                        |  many entry points,
+-----------+                     +-----------------------------+  many parameters
|           |                     | thin: mostly forwards calls |
|  a lot of |  behaviour hidden   +-----------------------------+
|  behaviour|
|           |
+-----------+
```

## Making it smaller

For each entry point, ask:

- Could two entry points become one, with the difference handled inside?
- Could a parameter be derived, defaulted, or moved into construction?
- Is the caller doing work (ordering calls, checking state, retrying) the
  module could do for it?

Each "yes" moves complexity behind the interface, where it is paid for once.

## Shaping it for tests

An interface that is easy to test is usually easy to call. Three habits get
most of the way there:

1. **Take collaborators in, do not build them inside.** A module that
   receives its clock, store or gateway can be tested with fakes at that
   seam:

   ```python
   # testable: the gateway arrives from outside
   def settle(invoice, gateway): ...

   # hard to test: the gateway is created inside
   def settle(invoice):
       gateway = CardGateway(api_key=load_key())
   ```

2. **Return a result instead of changing things in place.** A returned value
   can be asserted directly; a mutation has to be observed somewhere else:

   ```python
   # testable
   def price_with_discount(basket) -> Price: ...

   # harder: the effect hides inside the argument
   def apply_discount(basket) -> None: ...
   ```

3. **Keep the surface small.** Fewer entry points need fewer tests; fewer
   parameters need less setup per test.
