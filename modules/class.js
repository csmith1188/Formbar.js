// @TODO: Clean this up; simply separating code for now

function createClassInformation() {
    return {
        noClass: { students: {} }
    }
}

module.exports = {
    // classInformation stores all of the information on classes and students
    /* This line declares a variable classInformation and assigns it an object. This object has a single property, named noClass, which is itself an object with a single
    property, named students. The students property is an empty object that gets added to later. This structure is used to store classes and their students
    in a nested manner. */
    classInformation: createClassInformation()
}