@extends('layouts.app')

@section('title', 'Request lifecycle')

@section('content')
<article class="prose">
    <h1>Request lifecycle</h1>

    <p>
        This scene is owned by the Laravel application. Kineglyph supplies the renderer,
        interaction, responsive layout, and export path.
    </p>

    <x-kineglyph-figure
        scene="request-path"
        theme="docs"
        static="{{ asset('img/figures/request-path.svg') }}"
        caption="The same semantic scene mounts in Blade and exports as the static fallback." />
</article>
@endsection
