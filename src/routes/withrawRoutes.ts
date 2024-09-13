import { Router } from 'express';
import { createTaprootMultisig } from '../controller/taprootController';

const withrawRouter = Router();

withrawRouter.use(async (req, res, next)  => {
    console.log('');
    console.log(`Request received for ${req.method} ${req.url}`);
    next();
})

withrawRouter.post('/generateTaprootMultisig', async (req, res, next) => {
    try {
        const payload = await createTaprootMultisig();

        console.log("payload after create taproot multisig ==> ", payload);

        return res.status(200).send(payload);
    } catch (error: any) {
        console.error(error);
        return res.status(500).send({
            success: false,
            message: "There is Something wrong..",
            payload: null,
        });
    }
});

export default withrawRouter;