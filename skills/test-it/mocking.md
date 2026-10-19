# What to fake

Fake only what the project does not own and cannot run cheaply and
deterministically in a test:

| Fake it | Usually keep it real |
|---------|----------------------|
| Third-party APIs (payments, mail, maps) | Your own modules and classes |
| The clock and random numbers | Collaborators inside the module under test |
| Slow or shared infrastructure with no test instance | A database that has a throwaway test instance |
| The network | The file system, pointed at a temp directory |

Faking something you own hides the bugs that live in how your pieces fit
together, which is where most of them are.

## Shape the boundary so faking is easy

**Hand the dependency in.** Code that builds its own client cannot be given a
fake.

~~~ts
// Easy to fake: the caller supplies the mailer
export function sendReceipt(order: Order, mailer: Mailer) {
  return mailer.send(order.email, receiptFor(order));
}

// Hard to fake: the client is created inside
export function sendReceiptDirect(order: Order) {
  const mailer = new SmtpMailer(process.env.SMTP_URL);
  return mailer.send(order.email, receiptFor(order));
}
~~~

**One method per operation, not one generic request method.** A fake for a
narrow gateway returns one fixed shape per call; a fake for `request(path,
opts)` needs branching logic of its own, which is a second program to debug.

~~~ts
// Fakes trivially: each operation is its own method
interface Inventory {
  stockOf(sku: string): Promise<number>;
  reserve(sku: string, qty: number): Promise<Reservation>;
}

// Fakes badly: every test re-implements routing
interface InventoryHttp {
  request(path: string, init?: RequestInit): Promise<unknown>;
}
~~~

**Prefer a small in-memory fake to a mocking library** when the boundary has
state (a store, a queue): write it once next to the interface, and every test
gets realistic behaviour instead of scripted replies.
