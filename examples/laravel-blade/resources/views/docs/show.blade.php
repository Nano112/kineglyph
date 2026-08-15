@extends('layouts.app')

@section('title', 'Nucleation — how a build comes together')

@section('content')
<article class="prose">
    <h1>How a build comes together</h1>

    <p>
        Nucleation turns fields, shapes, and palettes into editable schematics. The figures on
        this page are live Kineglyph scenes: hover or focus a stage to inspect it, press the
        step buttons to change the state machine, and scrub the timeline.
    </p>

    <x-kineglyph-figure
        scene="fast-generation"
        theme="nucleation"
        static="{{ asset('img/figures/fast-generation.svg') }}"
        caption="Workload shape decides the bulk API; the comparison shows why call overhead differs." />

    <h2>Choosing an engine</h2>

    <p>
        The simulation laboratory is a deterministic state machine. Pick an intent, toggle the
        capabilities you need, and the recommended engine, its explanation, and the highlighted
        connectors change. Reset returns to the overview.
    </p>

    <x-kineglyph-figure
        scene="smart-simulation"
        theme="pock"
        :autoplay="false"
        caption="Signal shorthand, simulated placement, MCHPRS, or TickSimulation — depending on what the result must preserve." />

    <h2>Every format, one model</h2>

    <aside class="sidebar">
        {{-- The same scene resolves its compact layout in a narrow column. --}}
        <x-kineglyph-figure scene="formats-and-io" theme="schematio" :controls="false" />
    </aside>

    <p>
        Static exports of every figure (SVG, PNG, GIF) are produced by <code>kineglyph-export</code>
        during the docs build and passed to <code>static=</code> as the no-JavaScript fallback.
    </p>
</article>
@endsection
