# Keepers and failures

Examples in TypeScript (Vitest, no semicolons); the shapes carry to any
language and runner.

## Drive the seam, read the outcome

~~~ts
// Keeper: states a fact a caller depends on
test("an expired coupon is refused at checkout", async () => {
  const basket = basketWith({ sku: "MUG", qty: 1 })
  const outcome = await checkout(basket, { coupon: "SPRING-2020" })
  expect(outcome.refused).toBe("coupon-expired");
})
~~~

What makes it last: only the public entry point is touched, the name is a
behaviour, and nothing in it mentions how checkout is built.

## Pinned to the wiring

~~~ts
// Failure: proves a call happened, not that anything works
test("checkout asks the coupon service", async () => {
  const coupons = vi.mocked(couponService);
  await checkout(basket, { coupon: "SPRING-2020" })
  expect(coupons.lookup).toHaveBeenCalledOnce();
})
~~~

Signs of the same problem: a mocked module you own, call counts or call order
in the assertion, a test named after a function instead of an outcome.

## Checking through a side door

~~~ts
// Failure: bypasses the interface that made the promise
test("registering stores the member", async () => {
  await register({ email: "ana@example.org" })
  const rows = await sql`select * from members where email = 'ana@example.org'`;
  expect(rows.length).toBe(1);
})

// Keeper: the promise is that the member can be found again
test("a registered member can sign in", async () => {
  await register({ email: "ana@example.org", password: TEST_PASSWORD })
  const session = await signIn("ana@example.org", TEST_PASSWORD);
  expect(session.member.email).toBe("ana@example.org");
})
~~~

## Asserting the code against itself

~~~ts
// Failure: the expected value is computed the way the code computes it
test("shipping is weight times rate", () => {
  const parcels = [{ kg: 2 }, { kg: 3 }];
  const expected = parcels.reduce((t, p) => t + p.kg * RATE, 0);
  expect(shippingCost(parcels)).toBe(expected);
})

// Keeper: a number someone worked out by hand from the rate card
test("five kilos across two parcels cost 12.50", () => {
  expect(shippingCost([{ kg: 2 }, { kg: 3 }])).toBe(12.5);
})
~~~
