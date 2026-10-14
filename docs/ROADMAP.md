# Gin Schnaps roadmap

## Available

0.8.2 corrected history retention and unsaved PCR drafts. 0.8.3 added DNA
clipboard and automated native-write resilience. 0.8.4 added synchronized Map /
Sequence, editing shortcuts, and exchange-format exports. 0.8.5 adds explicit
PCR-to-document creation with saved inputs, exact annotation projection and review.
These are development previews, not laboratory-validated releases.

## Essential next work

1. Finish real installation acceptance on the old Intel Mac and actual OS file
   pickers, resolve the Linux GLib warning, and organize signing/notarization.
   Follow the [installation checklist](INSTALLATION_CHECKLIST.md).
2. Extend safe sequence editing for exact disjoint features, then direct nucleotide
   typing through the same commands; refine dense maps and everyday file navigation.
3. Evaluate existing oligos with an independently verified Primer3 integration
   before automated design. Do not invent Tm, specificity or experimental success.
4. Run a small user beta on authorized nonconfidential files; then Sanger
   verification, restriction–ligation and validated assemblies.

Keep the standalone browser package, English interface and a compact expert UI.
Retain React/TypeScript and the existing Rust/Tauri file host. Port scientific
computation only for measured benefit with parity tests, not a second divergent engine.
