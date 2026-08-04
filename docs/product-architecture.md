# AllTheRooms Host Product Architecture

## Product thesis

AllTheRooms is a property-centered local operating network for short-term rentals.

**Built for hosts. Experienced by guests. Powered by the local community.**

The host is the first customer. The guest receives the improved experience. Service providers and local businesses make the stay operationally reliable and locally distinctive.

## First-release surfaces

| Surface | Route | Audience | Purpose |
|---|---|---|---|
| Main website | `/` | Everyone | Brand and ecosystem introduction |
| Host website | `/hosts/` | Prospective hosts | Explain value and begin property onboarding |
| Property score | `/hosts/property-score/` | Prospective hosts | Primary host acquisition mechanism |
| Host prototype | `/prototype/host/` | Hosts and product reviewers | Demonstrate connected workspace |
| Travel library | `/travel/` | Search visitors and guests | Destination discovery and organic acquisition |
| Property profile | Future `/stay/[propertySlug]/` | Guests | Public property information and booking paths |
| Guest guide | Future `/stay/[propertySlug]/guide/` | Confirmed guests | Arrival, house, local, offers, and checkout |

## Core domain objects

### Property

The property is the central record. It connects:

- verified host ownership and team access
- source listings and preferred booking paths
- public profile
- AllTheRooms score and competitive set
- guest guide and QR code
- local recommendations and offers
- guest-guide engagement
- community market membership
- service-provider relationships

A host must never create the same property separately in different modules.

### Market

A geographic operating community such as Rincón, Puerto Rico. A market contains properties, verified hosts, community channels, service providers, local businesses, offers, and destination content.

### User and memberships

A person may hold more than one role:

- host or host-team member
- service provider
- local-business operator
- moderator or AllTheRooms administrator

Permissions come from memberships and relationships, not one permanent global role.

### Provider versus local business

Operational providers serve hosts: cleaners, repair professionals, pool care, photographers, accountants, and delivery services.

Local businesses primarily serve guests: restaurants, bars, shops, surf schools, tours, wellness providers, and attractions.

Some organizations may maintain both profiles.

## Module responsibilities

### Overview

Aggregates score, market position, upcoming stays, guide engagement, local alerts, and prioritized actions.

### My Properties

Imports, claims, verifies, edits, and publishes property information and booking/contact paths.

### Market

Provides the AllTheRooms score, comparable-property context, pricing observations, and explainable improvement opportunities. It must not claim access to private marketplace ranking algorithms.

### Guest Guide

Builds a mobile-first property guide. Public local information can be shareable; sensitive access details require reservation-specific or expiring authorization.

### Community

A market-based, verified-host discussion space for operations, vendors, alerts, regulations, exchanges, and events. Guest-identifying information is prohibited.

### Services

A host-facing directory and lead workflow for STR-specialized local providers, with verification states and reviews tied to legitimate host/provider relationships.

### Performance

Connects property economics, public-profile engagement, guest-guide usage, local actions, offers, redemptions, and repeat interest.

## Data and trust principles

1. Hosts review imported information before publication.
2. Source-platform URLs are onboarding aids, not an unrestricted scraping entitlement.
3. Scores are explainable and disclose their data sources and limitations.
4. Paid placement is always labeled.
5. Sponsorship never automatically becomes a host recommendation.
6. Provider credentials show verification status and expiration where applicable.
7. Community moderation is designed before public launch.
8. Sensitive arrival and access information is never permanently public.
9. Guest usage analytics are aggregated and privacy-conscious.
10. Every market begins with verified density, not empty nationwide coverage.

## Current technical stage

The repository currently uses static HTML, shared CSS, and small progressive-enhancement scripts. The host workspace is a clickable product prototype with illustrative data.

Authentication, durable data, imports, messaging, payments, QR authorization, moderation workflows, and marketplace transactions are intentionally deferred until the experience and data model are approved.

## Production migration

After prototype approval, migrate application routes to a dynamic framework and database while preserving public URLs:

- `/hosts/` remains public and indexable
- `/host/*` becomes authenticated
- `/stay/[propertySlug]/` becomes dynamically generated
- `/travel/*` remains public and indexable
- private arrival routes require an expiring stay token or authenticated reservation
