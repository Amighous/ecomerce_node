import Stripe from 'stripe'
import cartModel from '../../../DB/models/cart.model.js'
import couponModel from '../../../DB/models/coupon.model.js'
import orderModel from '../../../DB/models/order.model.js'
import productModel from '../../../DB/models/proudact.model.js'
import payment from '../../../utils/payment.js'


export const createOrder= async (req,res,next)=>{

    let {products,couponName}=req.body
    let amount=0; 

    if(couponName){
        const coupon=await couponModel.findOne({name:couponName,usedBy:{$nin:req.user._id}})
        if(!coupon || coupon.expireIn<new Date()){
            return next (new Error ('invalid coupon',{cause:400}))

        }
        amount = coupon.amount 
        req.body.couponId=coupon._id
    }

    if(!products){
        const cart= await cartModel.findOne({userId : req.user._id}) 
        if(!cart || !cart.products.length){
            return next (new Error ('invalid cart',{cause:404}))
        } 
        products=cart.products.toObject()
    }   

    let subPrice=0 
    const allProducts=[]

    for (const product of products) {
        
        
        const existProduct = await productModel.findOne({_id:product.productId,stock:{$gte:product.quantity}}) 
        if(!existProduct){
            return next (new Error ('invalid product',{cause:400}))
        }  

        const existProductInCart = await cartModel.findOne(
             {'products.productId':product.productId},
             {'products.$': 1})

        if(!existProductInCart){
        return next (new Error ('product not in the cart',{cause:404}))
        }  

        
        product.name=existProduct.name
        product.unitPrice=existProduct.totalPrice
        product.finalPrice=product.unitPrice*product.quantity
        subPrice +=product.finalPrice
        allProducts.push(product)
        
    }


    req.body.products= allProducts;
    req.body.subPrice= subPrice;
    req.body.userId= req.user._id;
    req.body.totalPrice= subPrice - (subPrice*amount)/100;

    (req.body?.paymentType=='cash')?req.body.status='placed':req.body.status='waitForPayment';

    for (const product of products) {
        await productModel.updateOne({_id:product.productId},{$inc:{stock:-product.quantity}}) 
        await cartModel.updateOne(
            { userId: req.user._id, 'products.productId': product.productId },
            { $pull: { products: { productId: product.productId } } },
            { new: true }
        );
    }
    if(couponName){
        await couponModel.updateOne({_id:req.body.couponId},{$push:{usedBy:req.user._id}}) 

    }
    const order = await orderModel.create(req.body)
     if (order.paymentType == "card") {
    let createCoupon;
    if (couponName) {
      createCoupon = await Stripe.coupons.create({
        percent_off: amount,
        duration: "once",
      });
    }
    const session = await payment({
      metadata: {
        orderId: order._id.toString(),
      },
      success_url: `${process.env.SUCCESS_URL}/${order._id}`,
      cancel_url: `${process.env.CANCEL_URL}/${order._id}`,
      customer_email: req.user.email,
      line_items: order.products.map((element) => {
        return {
          price_data: {
            currency: "usd",
            product_data: {
              name: element.name,
            },
            unit_amount: element.unitPrice * 100,
          },
          quantity: element.quantity,
        };
      }),
      discounts: couponName ? [{ coupon: createCoupon.id }] : [],
    });
     return res.json({message:'done',order,session })

    }

    return res.json({message:'done',order })
}

export const cancelOrder= async (req,res,next)=>{
    const {orderId}=req.params
    const order = await orderModel.findOne({_id:orderId,userId:req.user._id})
    if(!order){
        return next ( new Error ("invalid order",{cause:404}))
    }
    if(order.status == 'placed' ||order.status == 'waitForPayment'){

        for (const product of order.products) {
            await productModel.updateOne({_id:product.productId},{$inc:{stock: product.quantity}}) 
           
        }
        if(order.couponId){
            await couponModel.updateOne({_id:order.couponId},{$pull:{usedBy: order.userId}}) 
        }
        order.status='canceld'
        await order.save()

        return res.status(200).json({message:'done',order})

    }else{
        return next (new Error ('invalid canceld order',{cause:400}))

    }
 
}

export const delviredOrder= async (req,res,next)=>{
    const {orderId}=req.params
    const order = await orderModel.findById({_id:orderId})
    if(!order){
        return next ( new Error ("invalid order",{cause:404}))
    }
    if(order.status !='onWay'){
        return next ( new Error ("invalid delvired order",{cause:404}))
    }
    order.status='deliverd'
    order.updatedBy=req.user._id
    await order.save()

    return res.status(200).json({message:'done',order})
}

export const onWayOrder= async (req,res,next)=>{
    const {orderId}=req.params
    const order = await orderModel.findById({_id:orderId})
    if(!order){
        return next ( new Error ("invalid order",{cause:404}))
    }
    if(order.status !='placed'){
        return next ( new Error ("invalid onWayOrder order",{cause:404}))
    }
    order.status='onWayOrder'
    order.updatedBy=req.user._id
    await order.save()

    return res.status(200).json({message:'done',order})
}

export const rejectOrder= async (req,res,next)=>{
    const {orderId}=req.params
    const order = await orderModel.findById({_id:orderId})
    if(!order){
        return next ( new Error ("invalid order",{cause:404}))
    }
    if(order.status !='placed'||order.status !='waitForPayment'){
        return next ( new Error ("invalid rejected order",{cause:404}))
    }

    order.status='rejected'
    order.updatedBy=req.user._id
    await order.save()

    return res.status(200).json({message:'done',order})
}

export const allOrders= async (req,res,next)=>{
    const allOrders = await orderModel.find()
    return res.status(200).json({message:'done',allOrders})
}

export const allUserOrders= async (req,res,next)=>{

    const allUserOrders = await orderModel.find({ userId:req.user._id })
    return res.status(200).json({message:'done',allUserOrders})
}
 

export const webHook=async(req, res,next) => {
    const stripe = new Stripe(process.env.PAYMENT_KEY) 
    const endpointSecret =process.env.END_POINT_SECRET;

const sig = request.headers['stripe-signature'];

let event;

try {
  event = stripe.webhooks.constructEvent(request.body, sig, endpointSecret);
} catch (err) {
  response.status(400).send(`Webhook Error: ${err.message}`);
  }

// Handle the event
if (event.type=='checkout.session.completed') {
    let orderId=event.data.object.metadata.orderId
    const updateOrder = await orderModel.updateOne({_id:orderId},{status:'placed'})
    return res.json({message:"done"})
}
return next(new Error('failed to payment',{cause:500}))
}