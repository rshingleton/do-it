# Smell baseline

The Standards reviewer checks these even in a repo that documents nothing.
They come from the code-smell catalogue in Martin Fowler's _Refactoring_.
Each is a hint worth a look, reported as "possible <smell>", never as a rule
broken. A documented repo rule that allows the pattern switches the smell off.

| Smell | Looks like, in a diff | Usual remedy |
|-------|-----------------------|--------------|
| Unclear name | A name that does not say what the thing holds or does | Rename; if no honest name comes, the design needs another look |
| Repeated logic | The same shape of code in two hunks or files of this change | One shared function both call |
| Envy | A function busier with another object's fields than its own | Move it next to the data it uses |
| Travelling group | The same few values passed together again and again | Make them one type |
| Bare primitive | A string or number standing in for a domain idea | A small type of its own |
| Repeated branching | The same switch or if-chain on the same kind recurring | One lookup or polymorphism shared by both sites |
| Scattered edit | One logical change touching many files | Gather what changes together into one module |
| Mixed reasons | One file edited for several unrelated reasons | Split it along those reasons |
| Just-in-case | Parameters, hooks or layers the spec never asked for | Delete; add back when a real need shows up |
| Long chains | `a.b().c().d()` walks the caller should not know about | One method on the first object hides the walk |
| Pass-through | A class or function that only hands calls onward | Remove it and call the real target |
| Ignored inheritance | A subclass that overrides or ignores most of its parent | Composition instead of inheritance |
