# Todo

Kallo Framework update:
1. Update the framework api endpoints to not be file based like nextjs, but should follow Express pattern 100%. Which means we need routes, controllers and service (local and global middleware/guard) since we have the view dir. Only the view dir should follow file based routing. The kallo framework should follow this strict system at all cost just like NestJs backend framework.
2. Update the CLI to generate this new structure.
3. Using the <Server> and <Client> outside the page.kal or layout.kal should not be allowed. Make sure the framework also support the <Head> incase they want to add things like <Link> tags and other things and it should work with the $meta side-by-side, this should also be allowed.
4. make sure the public dir is recognized so that the dev can add font, css, image, video and any other file there.
5. make sure the build command for a kallo project works and the start command can run it.
6. Create a command in the root package json to generate a new kallo project in the temp dir test-app-1 test-app-2 etc using a script or something so it'll be easy for us to test the framework extensively.
---
I don't know if my methods follow best practices, but I'm open to suggestions and improvements. Do what you reason is best for this framework.