import joi from "joi"
import { generalFileds } from "../../utils/generalFileds.js"

export const tokenSchema = joi.object({
    authorization:joi.string().required()
}).required()
 
export const userUdateSchema = joi.object({
    email:generalFileds.email,
    // DOB:joi.string().isoDate().max('now'),
    userName:generalFileds.name,
    phoneNumber:joi.string().trim().pattern(/^[0-9]{10}$/)
}).required()
export const userEmailSchema = joi.object({
    email:generalFileds.email
}).required()

export const passwordSchema = joi.object({
    oldPassword:generalFileds.password.required(),
    newPassword:generalFileds.password.required()
}).required()
