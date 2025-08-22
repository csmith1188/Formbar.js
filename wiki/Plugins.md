# Using Plugins on Formbar.js

This is a quick guide to explain how to find and use plugins for your classes in Formbar

## Finding plugins

1. Log in to an account with teacher permissions or higher.
2. Create or join a preexisting class you own.
3. Navigate to the plugin page from the control panel.

You should now see a list of every Formbar.js plugin that has been loaded into Formbar

## Installing, Toggling, and Using Plugins

On the plugin page, locate the plugin you wish to control. There are 4 buttons related to plugins to know.
Plugins are class dependent, so an action in one class will not affect another.

- **Install**: The install button will load the plugin into your class.
- **Uninstall**: The uninstall will unload the plugin from your class. 
- **Enable**: The enable button will enable the plugin for the class and run the plugin's onEnable function
- **Disable**: The enable button will enable the plugin for the class and run the plugin's onDisable function

To use a plugin, you must install and enable it in a class, then start that class. A plugin will not work unless the class has been started.


# Creating Plugins for Formbar.js

The following guide will walk you through the steps to create a plugin for Formbar.js. Plugins allow you to add extra functionality to Formbar.js and extend its possibilities.

---

## Prerequisites

Before creating a plugin, ensure you have the following:
- **Node.js** installed on your machine.
- A working instance of Formbar.js running locally. (See [Hosting Formbar.js Locally](https://github.com/csmith1188/Formbar.js/wiki/Hosting-Formbar.js-Locally))
- Basic knowledge of JavaScript and Express.js.

---

## Plugin Structure

A plugin for Formbar.js should follow this structure:

```
plugins/
└── pluginDir/
    ├── app.js
    ├── other-files (optional)
    └── other-dirs/ (optional)
        └── other-files (optional)
```

### The Essential File: `app.js`
The `app.js` file is the main entry point for your plugin. In it will contain code required to interface with Formbar.js and more, if desired.

---

## Steps to Create a Plugin

### 1. Create a Plugin Directory
1. Navigate to the `plugins` directory in your Formbar.js project.
2. Create a new folder for your plugin. For example:
   ```
   plugins/MyCustomPlugin/
   ```

### 2. Create the `app.js` File
1. Inside your plugin directory, create a file named `app.js`.
2. Use the following template as a starting point:

   ```javascript
   // Middleware to be used in every route for plugins
   const { isEnabled } = require('../../modules/plugins');
   const name = 'MyCustomPlugin';

   function init(app) {
       // Code to run when the plugin is initialized

   }

   function onEnable() {
       // Code to run when the plugin is enabled

   }

   function onDisable() {
       // Code to run when the plugin is disabled

   }

   module.exports = {
       // Plugin information
       name: name,
       description: 'This is a custom plugin.',
       authors: [example_id],
       version: '1.0',
       // Plugin functions
       init,
       onEnable,
       onDisable
   };
   ```

### 3. Define Plugin Metadata
In the `module.exports` section of `app.js`, define the following:
- **`name`**: The name of your plugin.
- **`description`**: A short description of what your plugin does.
- **`authors`**: An array of authors' ids.
- **`version`**: The version of your plugin.

If you update your plugin, ensure the version changes so that Formbar can update the relevant information in the database.

### 4. Create your plugin!
From hereon out, you can create your plugin as you wish. The following are just some things to keep in mind...

- **init(app)**: This is where routing will be done for your plugin. If you want any custom routes, this is where they will be initialized. Every plugin route must use the isEnabled middleware function provided by Formbar.js, from the modules/plugin.js file.
- **onEnable()**: This function is ran on enabling the plugin. Keep it in mind for anything that might need to be toggled in the plugin.
- **onDisable()**: This function is ran on disabling the plugin. Keep it in mind for anything that might need to be toggled in the plugin.
---

## Testing Your Plugin

1. Navigate to your Formbar.js directory and start Formbar:
   ```bash
   node app
   ```
2. If you have not already, create an account with Formbar on your local machine
3. Log into an account with teacher permissions or above
4. Create a class or join a class you have created
5. Start the class
6. Navigate to the plugin page with the plugin button
7. Find your plugin on the plugin page and click install.
8. If it is not enabled, enable your plugin.

Now your plugin should be enabled, and you can test it as you see fit.

---

## Best Practices

- **Unique Names**: Ensure your plugin's name is unique to avoid conflicts.
- **Error Handling**: Add proper error handling to your routes and middleware.
- **Database Integration**: If your plugin requires database access, use the `dbGet` function provided by Formbar.js.

---

## Example Plugin

Refer to the `ExamplePlugin` directory in the `plugins` folder for a fully functional example of a plugin.

---

## Troubleshooting

- **Plugin Not Loading**: Ensure your plugin directory contains an `app.js` file and that it exports the required functions.
- **Route Not Found**: Verify that the route is correctly defined in the `init` function and matches the URL you are accessing.

If you encounter any issues, feel free to submit a ticket on the Formbar.js GitHub Issues page at https://github.com/csmith1188/Formbar.js/issues.

---

Congratulations! You have successfully created a plugin for Formbar.js.