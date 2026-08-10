# Samferd

**Etymology:** from *sam-* (“co-”) + *ferd* (“journey”).
**Noun** — *samferd*: travel, journey together with someone.

📄 **Specification:** [docs/spec.md](docs/spec.md) · [docs/data-model.md](docs/data-model.md) · [docs/api.md](docs/api.md) · [docs/architecture.md](docs/architecture.md)

---
## Original brief


I want to create a webapp that will let grou of people coordinate travels.

The usecase is that I and other people are travelling from around the same place and would like to minimize the number of cars and to pay the lowest overall travel cost per person

The philosophy opf the app it that we only want to coordonate the travel and help find the lowest air travel fare and parking cost for the car at the airport. The app is only an helper tool and is not designed to make money in itself.

I planned to use the skyscanner api to retrieve prices.
https://developers.skyscanner.net/docs/intro

On a ui/ux standpoint I wa  nt the app to have a homescreen with an event where we want to coordinate travel, when you click on that event you can see who is registered to that event and will travel by air and who can take his car to the airport with how many passenger space free.

As a user I want to see an updated dynamic table of current air travel prices using the skysqcanner app from the different airports available for that event.
Ideally I want the links to book the flights directly and the flight number to that I can still look for it in another tool if I wish.
When I booked a flight I want to be able to put the flight number and the day of the flight so that other people can see what flight everybody took.

Event pages should be created by administrators only.
The website should be available for registered users only.

Help me create a list of points that need to be detailed, ask me questions and confront my choices so that the spec sheet is as detailed and complete as possible.

Do not implement anything as long as I am not satisfied with the spec sheet.