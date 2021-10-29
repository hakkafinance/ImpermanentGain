import { expect, use } from "chai";
import { ethers, network } from "hardhat";
import { BigNumber } from "ethers";
import chaiAsPromised from "chai-as-promised";
import { ERC20Mintable, IGainAAVEIRS } from "../typechain";
import { getRevertError, getSigner } from "./utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { parseUnits } from "@ethersproject/units";
import { getAddress } from "@ethersproject/address";
import BN from "bignumber.js";

use(chaiAsPromised);

function getFee(
  openTime: BigNumber,
  closeTime: BigNumber,
  txTime: BigNumber,
  minFee: BigNumber,
  maxFee: BigNumber
): BigNumber {
  if (closeTime.lte(openTime)) return BigNumber.from("10").pow(18).sub(maxFee);
  return BigNumber.from("10")
    .pow(18)
    .sub(
      minFee.add(
        maxFee
          .sub(minFee)
          .mul(txTime.sub(openTime))
          .div(closeTime.sub(openTime))
      )
    );
}

describe("IGainAAVEIRS", function () {
  const amount = BigNumber.from(parseUnits("10000"));
  let IGainAAVEIRS: IGainAAVEIRS;
  let IGainAAVEIRSUser: IGainAAVEIRS;
  let accounts: SignerWithAddress[];
  let operator: SignerWithAddress;
  let user: SignerWithAddress;
  let base: ERC20Mintable;
  let aContract: ERC20Mintable;
  let bContract: ERC20Mintable;
  let timeGap = 100;

  // Init configs
  const baseToken = getAddress("0x6B175474E89094C44Da98b954EedeAC495271d0F");
  const lendingPool = getAddress("0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9");
  const asset = getAddress("0x6B175474E89094C44Da98b954EedeAC495271d0F");
  const treasury = getAddress("0x83D0D842e6DB3B020f384a2af11bD14787BEC8E7");
  const batchName = "IRS-aDAI";
  const leverage = BigNumber.from("5000000000000000000");
  const duration = BigNumber.from("86400");
  const a = BigNumber.from("1000000000000000000");
  const b = BigNumber.from("1000000000000000000");

  before(async function () {
    accounts = await ethers.getSigners();
    operator = accounts[0];
    user = accounts[1];

    const IGainAAVEIRSDeployer = await ethers.getContractFactory(
      "IGainAAVEIRS"
    );
    IGainAAVEIRS = await IGainAAVEIRSDeployer.deploy();
    IGainAAVEIRSUser = IGainAAVEIRS.connect(user);
    await IGainAAVEIRS.deployed();

    base = await ethers.getContractAt(
      "ERC20Mintable",
      "0x6B175474E89094C44Da98b954EedeAC495271d0F" // DAI
    );
    const basePool = base.connect(
      await getSigner("0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7") // Curve Pool
    );
    await basePool.transfer(operator.address, amount);
    await basePool.transfer(user.address, amount);
    await base.approve(IGainAAVEIRS.address, amount);
    await base.connect(user).approve(IGainAAVEIRS.address, amount);
  });

  describe("Before Init", async function () {
    it("Should not mintable", async function () {
      await expect(IGainAAVEIRS.mint(amount)).eventually.be.rejectedWith(
        Error,
        getRevertError("cannot buy")
      );
      await expect(IGainAAVEIRS.mintLP(amount, "0")).eventually.be.rejectedWith(
        Error,
        getRevertError("cannot buy")
      );
      await expect(IGainAAVEIRS.mintA(amount, "0")).eventually.be.rejectedWith(
        Error,
        getRevertError("cannot buy")
      );
      await expect(
        IGainAAVEIRS.mintExactA(amount, "0")
      ).eventually.be.rejectedWith(Error, getRevertError("cannot buy"));
      await expect(IGainAAVEIRS.mintB(amount, "0")).eventually.be.rejectedWith(
        Error,
        getRevertError("cannot buy")
      );
      await expect(
        IGainAAVEIRS.mintExactB(amount, "0")
      ).eventually.be.rejectedWith(Error, getRevertError("cannot buy"));
    });

    it("Should not burnable", async function () {
      await expect(IGainAAVEIRS.burnA(amount, "0")).eventually.be.rejectedWith(
        Error,
        getRevertError("cannot buy")
      );
      await expect(IGainAAVEIRS.burnB(amount, "0")).eventually.be.rejectedWith(
        Error,
        getRevertError("cannot buy")
      );
      await expect(IGainAAVEIRS.burnLP(amount, "0")).eventually.be.rejectedWith(
        Error,
        getRevertError("cannot buy")
      );
    });

    it("Should not swapable", async function () {
      await expect(
        IGainAAVEIRS.swapAtoB(amount, "0")
      ).eventually.be.rejectedWith(Error, getRevertError("cannot buy"));
      await expect(
        IGainAAVEIRS.swapBtoA(amount, "0")
      ).eventually.be.rejectedWith(Error, getRevertError("cannot buy"));
    });

    it("Should not depositable or withdrawable", async function () {
      await expect(
        IGainAAVEIRS.depositLP("0", "0", "0")
      ).eventually.be.rejectedWith(Error, getRevertError("cannot buy"));
      await expect(
        IGainAAVEIRS.withdrawLP("0", "0", "0")
      ).eventually.be.rejectedWith(Error, getRevertError("cannot buy"));
    });

    it("Should not claimable", async function () {
      await expect(IGainAAVEIRS.claim()).eventually.be.rejected;
    });
  });

  describe("Init", async function () {
    it("Should initable", async function () {
      await IGainAAVEIRS.init(
        baseToken,
        lendingPool,
        asset,
        treasury,
        batchName,
        leverage,
        duration,
        a,
        b
      );

      const [
        resultBaseToken,
        resultLendingPool,
        resultAsset,
        resultTreasury,
        resultLeverage,
        resultOpenTime,
        resultCloseTime,
        resultA,
        resultB,
      ] = await Promise.all([
        IGainAAVEIRS.baseToken(),
        IGainAAVEIRS.AAVE(),
        IGainAAVEIRS.asset(),
        IGainAAVEIRS.treasury(),
        IGainAAVEIRS.leverage(),
        IGainAAVEIRS.openTime(),
        IGainAAVEIRS.closeTime(),
        IGainAAVEIRS.a(),
        IGainAAVEIRS.b(),
      ]);

      expect(baseToken).equal(resultBaseToken);
      expect(lendingPool).equal(resultLendingPool);
      expect(asset).equal(resultAsset);
      expect(treasury).equal(resultTreasury);
      expect(leverage).equal(resultLeverage);
      expect(duration).equal(resultCloseTime.sub(resultOpenTime));

      aContract = await ethers.getContractAt("ERC20Mintable", resultA);
      bContract = await ethers.getContractAt("ERC20Mintable", resultB);

      expect("iGain A token " + batchName).equal(await aContract.name());
      expect("iGain B token " + batchName).equal(await bContract.name());
      expect("iG-A " + batchName).equal(await aContract.symbol());
      expect("iG-B " + batchName).equal(await bContract.symbol());
      expect(await base.decimals()).equal(await aContract.decimals());
      expect(await base.decimals()).equal(await bContract.decimals());
    });

    it("Should not re-initable", async function () {
      await expect(
        IGainAAVEIRS.init(
          baseToken,
          lendingPool,
          asset,
          treasury,
          batchName,
          leverage,
          duration,
          a,
          b
        )
      ).eventually.be.rejected;
    });
  });

  describe("Before close time", async function () {
    it("Should not closable", async function () {
      await expect(IGainAAVEIRS.close()).eventually.be.rejected;
    });

    describe("Mint functionality", async function () {
      const mintAmount = amount.div(9);

      it("Should mintable for a and b", async function () {
        const [userABalance, userBBalance, contractBaseBalance] =
          await Promise.all([
            aContract.balanceOf(user.address),
            bContract.balanceOf(user.address),
            base.balanceOf(IGainAAVEIRS.address),
          ]);
        await IGainAAVEIRSUser.mint(mintAmount);

        const [newUserABalance, newUserBBalance, newContractBaseBalance] =
          await Promise.all([
            aContract.balanceOf(user.address),
            bContract.balanceOf(user.address),
            base.balanceOf(IGainAAVEIRS.address),
          ]);
        expect(contractBaseBalance.add(mintAmount)).equal(
          newContractBaseBalance
        );
        expect(userABalance.add(mintAmount)).equal(newUserABalance);
        expect(userBBalance.add(mintAmount)).equal(newUserBBalance);
      });

      it("Should not mintable for a and b without sufficient balance");

      it("Should mintable for a", async function () {
        const [userABalance, userBBalance, contractBaseBalance] =
          await Promise.all([
            aContract.balanceOf(user.address),
            bContract.balanceOf(user.address),
            base.balanceOf(IGainAAVEIRS.address),
          ]);

        const [openTime, closeTime, minFee, maxFee] = await Promise.all([
          IGainAAVEIRS.openTime(),
          IGainAAVEIRS.closeTime(),
          IGainAAVEIRS.minFee(),
          IGainAAVEIRS.maxFee(),
        ]);
        const txTime = openTime.add(timeGap++);
        const fee = getFee(openTime, closeTime, txTime, minFee, maxFee);
        const [poolA, poolB] = await Promise.all([
          IGainAAVEIRS.poolA(),
          IGainAAVEIRS.poolB(),
        ]);
        const maxOut = mintAmount.add(
          mintAmount
            .mul(fee)
            .mul(poolA)
            .div(
              poolB.mul(BigNumber.from("10").pow(18)).add(mintAmount.mul(fee))
            )
        );

        network.provider.send("evm_setNextBlockTimestamp", [txTime.toNumber()]);
        await IGainAAVEIRSUser.mintA(mintAmount, maxOut);

        const [newUserABalance, newUserBBalance, newContractBaseBalance] =
          await Promise.all([
            aContract.balanceOf(user.address),
            bContract.balanceOf(user.address),
            base.balanceOf(IGainAAVEIRS.address),
          ]);
        expect(contractBaseBalance.add(mintAmount)).equal(
          newContractBaseBalance
        );
        expect(userABalance.add(maxOut)).equal(newUserABalance);
        expect(userBBalance).equal(newUserBBalance);
      });

      it("Should not mintable for a without sufficient balance");

      it("Should revert when cannot mint a more than desired", async function () {
        const [openTime, closeTime, minFee, maxFee] = await Promise.all([
          IGainAAVEIRS.openTime(),
          IGainAAVEIRS.closeTime(),
          IGainAAVEIRS.minFee(),
          IGainAAVEIRS.maxFee(),
        ]);
        const txTime = openTime.add(timeGap++);
        const fee = getFee(openTime, closeTime, txTime, minFee, maxFee);
        const [poolA, poolB] = await Promise.all([
          IGainAAVEIRS.poolA(),
          IGainAAVEIRS.poolB(),
        ]);
        const maxOut = mintAmount.add(
          mintAmount
            .mul(fee)
            .mul(poolA)
            .div(
              poolB.mul(BigNumber.from("10").pow(18)).add(mintAmount.mul(fee))
            )
        );

        network.provider.send("evm_setNextBlockTimestamp", [txTime.toNumber()]);
        await expect(
          IGainAAVEIRSUser.mintA(mintAmount, maxOut.add(1))
        ).eventually.be.rejectedWith(
          Error,
          getRevertError("SLIPPAGE_DETECTED")
        );
      });

      it("Should exact-mintable for a", async function () {
        const [userABalance, userBBalance, contractBaseBalance] =
          await Promise.all([
            aContract.balanceOf(user.address),
            bContract.balanceOf(user.address),
            base.balanceOf(IGainAAVEIRS.address),
          ]);

        const [openTime, closeTime, minFee, maxFee] = await Promise.all([
          IGainAAVEIRS.openTime(),
          IGainAAVEIRS.closeTime(),
          IGainAAVEIRS.minFee(),
          IGainAAVEIRS.maxFee(),
        ]);
        const txTime = openTime.add(timeGap++);
        const fee = getFee(openTime, closeTime, txTime, minFee, maxFee);
        const [poolA, poolB] = await Promise.all([
          IGainAAVEIRS.poolA(),
          IGainAAVEIRS.poolB(),
        ]);
        const maxOut = mintAmount.add(
          mintAmount
            .mul(fee)
            .mul(poolA)
            .div(
              poolB.mul(BigNumber.from("10").pow(18)).add(mintAmount.mul(fee))
            )
        );

        network.provider.send("evm_setNextBlockTimestamp", [txTime.toNumber()]);

        // await IGainAAVEIRSUser.mintA(mintAmount, maxOut);
        await IGainAAVEIRSUser.mintExactA(maxOut, mintAmount);

        const [newUserABalance, newUserBBalance, newContractBaseBalance] =
          await Promise.all([
            aContract.balanceOf(user.address),
            bContract.balanceOf(user.address),
            base.balanceOf(IGainAAVEIRS.address),
          ]);
        expect(contractBaseBalance.add(mintAmount)).equal(
          newContractBaseBalance
        );
        expect(userABalance.add(maxOut)).equal(newUserABalance);
        expect(userBBalance).equal(newUserBBalance);
      });

      it("Should revert when cannot mint a as desired", async function () {
        const [openTime, closeTime, minFee, maxFee] = await Promise.all([
          IGainAAVEIRS.openTime(),
          IGainAAVEIRS.closeTime(),
          IGainAAVEIRS.minFee(),
          IGainAAVEIRS.maxFee(),
        ]);
        const txTime = openTime.add(timeGap++);
        const fee = getFee(openTime, closeTime, txTime, minFee, maxFee);
        const [poolA, poolB] = await Promise.all([
          IGainAAVEIRS.poolA(),
          IGainAAVEIRS.poolB(),
        ]);
        const maxOut = mintAmount.add(
          mintAmount
            .mul(fee)
            .mul(poolA)
            .div(
              poolB.mul(BigNumber.from("10").pow(18)).add(mintAmount.mul(fee))
            )
        );

        network.provider.send("evm_setNextBlockTimestamp", [txTime.toNumber()]);

        await expect(
          IGainAAVEIRSUser.mintExactA(maxOut.add(1), mintAmount)
        ).eventually.be.rejectedWith(
          Error,
          getRevertError("SLIPPAGE_DETECTED")
        );
        await expect(
          IGainAAVEIRSUser.mintExactA(maxOut, mintAmount.sub(1))
        ).eventually.be.rejectedWith(
          Error,
          getRevertError("SLIPPAGE_DETECTED")
        );
      });

      it("Should mintable for b", async function () {
        const [userABalance, userBBalance, contractBaseBalance] =
          await Promise.all([
            aContract.balanceOf(user.address),
            bContract.balanceOf(user.address),
            base.balanceOf(IGainAAVEIRS.address),
          ]);

        const [openTime, closeTime, minFee, maxFee] = await Promise.all([
          IGainAAVEIRS.openTime(),
          IGainAAVEIRS.closeTime(),
          IGainAAVEIRS.minFee(),
          IGainAAVEIRS.maxFee(),
        ]);
        const txTime = openTime.add(timeGap++);
        const fee = getFee(openTime, closeTime, txTime, minFee, maxFee);
        const [poolA, poolB] = await Promise.all([
          IGainAAVEIRS.poolA(),
          IGainAAVEIRS.poolB(),
        ]);
        const maxOut = mintAmount.add(
          mintAmount
            .mul(fee)
            .mul(poolB)
            .div(
              poolA.mul(BigNumber.from("10").pow(18)).add(mintAmount.mul(fee))
            )
        );

        network.provider.send("evm_setNextBlockTimestamp", [txTime.toNumber()]);
        await IGainAAVEIRSUser.mintB(mintAmount, maxOut);

        const [newUserABalance, newUserBBalance, newContractBaseBalance] =
          await Promise.all([
            aContract.balanceOf(user.address),
            bContract.balanceOf(user.address),
            base.balanceOf(IGainAAVEIRS.address),
          ]);
        expect(contractBaseBalance.add(mintAmount)).equal(
          newContractBaseBalance
        );
        expect(userBBalance.add(maxOut)).equal(newUserBBalance);
        expect(userABalance).equal(newUserABalance);
      });

      it("Should not mintable for b without sufficient balance");

      it("Should revert when cannot mint b more than desired", async function () {
        const [openTime, closeTime, minFee, maxFee] = await Promise.all([
          IGainAAVEIRS.openTime(),
          IGainAAVEIRS.closeTime(),
          IGainAAVEIRS.minFee(),
          IGainAAVEIRS.maxFee(),
        ]);
        const txTime = openTime.add(timeGap++);
        const fee = getFee(openTime, closeTime, txTime, minFee, maxFee);
        const [poolA, poolB] = await Promise.all([
          IGainAAVEIRS.poolA(),
          IGainAAVEIRS.poolB(),
        ]);
        const maxOut = mintAmount.add(
          mintAmount
            .mul(fee)
            .mul(poolB)
            .div(
              poolA.mul(BigNumber.from("10").pow(18)).add(mintAmount.mul(fee))
            )
        );

        network.provider.send("evm_setNextBlockTimestamp", [txTime.toNumber()]);
        await expect(
          IGainAAVEIRSUser.mintB(mintAmount, maxOut.add(1))
        ).eventually.be.rejectedWith(
          Error,
          getRevertError("SLIPPAGE_DETECTED")
        );
      });

      it("Should exact-mintable for b", async function () {
        const [userABalance, userBBalance, contractBaseBalance] =
          await Promise.all([
            aContract.balanceOf(user.address),
            bContract.balanceOf(user.address),
            base.balanceOf(IGainAAVEIRS.address),
          ]);

        const [openTime, closeTime, minFee, maxFee] = await Promise.all([
          IGainAAVEIRS.openTime(),
          IGainAAVEIRS.closeTime(),
          IGainAAVEIRS.minFee(),
          IGainAAVEIRS.maxFee(),
        ]);
        const txTime = openTime.add(timeGap++);
        const fee = getFee(openTime, closeTime, txTime, minFee, maxFee);
        const [poolA, poolB] = await Promise.all([
          IGainAAVEIRS.poolA(),
          IGainAAVEIRS.poolB(),
        ]);
        const maxOut = mintAmount.add(
          mintAmount
            .mul(fee)
            .mul(poolB)
            .div(
              poolA.mul(BigNumber.from("10").pow(18)).add(mintAmount.mul(fee))
            )
        );

        network.provider.send("evm_setNextBlockTimestamp", [txTime.toNumber()]);

        // await IGainAAVEIRSUser.mintA(mintAmount, maxOut);
        await IGainAAVEIRSUser.mintExactB(maxOut, mintAmount);

        const [newUserABalance, newUserBBalance, newContractBaseBalance] =
          await Promise.all([
            aContract.balanceOf(user.address),
            bContract.balanceOf(user.address),
            base.balanceOf(IGainAAVEIRS.address),
          ]);
        expect(contractBaseBalance.add(mintAmount)).equal(
          newContractBaseBalance
        );
        expect(userBBalance.add(maxOut)).equal(newUserBBalance);
        expect(userABalance).equal(newUserABalance);
      });

      it("Should revert when cannot mint b as desired", async function () {
        const [openTime, closeTime, minFee, maxFee] = await Promise.all([
          IGainAAVEIRS.openTime(),
          IGainAAVEIRS.closeTime(),
          IGainAAVEIRS.minFee(),
          IGainAAVEIRS.maxFee(),
        ]);
        const txTime = openTime.add(timeGap++);
        const fee = getFee(openTime, closeTime, txTime, minFee, maxFee);
        const [poolA, poolB] = await Promise.all([
          IGainAAVEIRS.poolA(),
          IGainAAVEIRS.poolB(),
        ]);
        const maxOut = mintAmount.add(
          mintAmount
            .mul(fee)
            .mul(poolB)
            .div(
              poolA.mul(BigNumber.from("10").pow(18)).add(mintAmount.mul(fee))
            )
        );

        network.provider.send("evm_setNextBlockTimestamp", [txTime.toNumber()]);

        await expect(
          IGainAAVEIRSUser.mintExactB(maxOut.add(1), mintAmount)
        ).eventually.be.rejectedWith(
          Error,
          getRevertError("SLIPPAGE_DETECTED")
        );
        await expect(
          IGainAAVEIRSUser.mintExactB(maxOut, mintAmount.sub(1))
        ).eventually.be.rejectedWith(
          Error,
          getRevertError("SLIPPAGE_DETECTED")
        );
      });

      it("Should mintable for lp", async function () {
        const [openTime, closeTime, minFee, maxFee, poolA, poolB, totalSupply] =
          await Promise.all([
            IGainAAVEIRS.openTime(),
            IGainAAVEIRS.closeTime(),
            IGainAAVEIRS.minFee(),
            IGainAAVEIRS.maxFee(),
            IGainAAVEIRS.poolA(),
            IGainAAVEIRS.poolB(),
            IGainAAVEIRS.totalSupply(),
          ]);
        const txTime = openTime.add(timeGap++);
        const fee = getFee(openTime, closeTime, txTime, minFee, maxFee);

        const [userLPBalance, contractBaseBalance] = await Promise.all([
          IGainAAVEIRS.balanceOf(user.address),
          base.balanceOf(IGainAAVEIRS.address),
        ]);

        const maxOut = BigNumber.from(
          new BN(poolA.add(mintAmount).mul(poolB.add(mintAmount)).toString())
            .sqrt()
            .integerValue(BN.ROUND_FLOOR)
            .toString(10)
        )
          .mul(BigNumber.from(10).pow(18))
          .div(
            BigNumber.from(
              new BN(poolA.mul(poolB).toString())
                .sqrt()
                .integerValue(BN.ROUND_FLOOR)
                .toString(10)
            )
          )
          .sub(BigNumber.from(10).pow(18))
          .mul(totalSupply)
          .div(BigNumber.from(10).pow(18))
          .mul(fee)
          .div(BigNumber.from(10).pow(18));

        await IGainAAVEIRSUser.mintLP(mintAmount, maxOut);

        const [newUserLPBalance, newContractBaseBalance] = await Promise.all([
          IGainAAVEIRS.balanceOf(user.address),
          base.balanceOf(IGainAAVEIRS.address),
        ]);
        expect(contractBaseBalance.add(mintAmount)).equal(
          newContractBaseBalance
        );
        expect(userLPBalance.add(maxOut)).equal(newUserLPBalance);
      });

      it("Should not mintable for lp without sufficient balance");

      it("Should revert when cannot mint lp as desired", async function () {
        const [openTime, closeTime, minFee, maxFee, poolA, poolB, totalSupply] =
          await Promise.all([
            IGainAAVEIRS.openTime(),
            IGainAAVEIRS.closeTime(),
            IGainAAVEIRS.minFee(),
            IGainAAVEIRS.maxFee(),
            IGainAAVEIRS.poolA(),
            IGainAAVEIRS.poolB(),
            IGainAAVEIRS.totalSupply(),
          ]);
        const txTime = openTime.add(timeGap++);
        const fee = getFee(openTime, closeTime, txTime, minFee, maxFee);

        const maxOut = BigNumber.from(
          new BN(poolA.add(mintAmount).mul(poolB.add(mintAmount)).toString())
            .sqrt()
            .integerValue(BN.ROUND_FLOOR)
            .toString(10)
        )
          .mul(BigNumber.from(10).pow(18))
          .div(
            BigNumber.from(
              new BN(poolA.mul(poolB).toString())
                .sqrt()
                .integerValue(BN.ROUND_FLOOR)
                .toString(10)
            )
          )
          .sub(BigNumber.from(10).pow(18))
          .mul(totalSupply)
          .div(BigNumber.from(10).pow(18))
          .mul(fee)
          .div(BigNumber.from(10).pow(18));

        await expect(
          IGainAAVEIRSUser.mintLP(mintAmount, maxOut.add(1))
        ).eventually.rejectedWith(Error, "SLIPPAGE_DETECTED");
      });
    });

    describe("Burn functionality", async function () {
      it("Should burnable for a and b");
      it("Should not burnable for a and b without sufficient balance");
      it("Should burnable for a");
      it("Should not burnable for a without sufficient balance");
      it("Should burnable for b");
      it("Should not burnable for b without sufficient balance");
      it("Should burnable for lp");
      it("Should not burnable for lp without sufficient balance");
    });

    describe("Swap functionality", async function () {
      it("Should swapable from a to b");
      it("Should not swapable from a to b without sufficient balance");
      it("Should swapable from b to a");
      it("Should not swapable from b to a without sufficient balance");
    });

    describe("LP functionality", async function () {
      it("Should depositable");
      it("Should not depositable without sufficient balance");
      it("Should withdrawable");
      it("Should not withdrawable without sufficient balance");
    });

    it("Should not claimable");
  });

  describe("After close time", async function () {
    it("Should closable after duration", async function () {
      await network.provider.send("evm_increaseTime", [86400]);
      await network.provider.send("evm_mine");

      await expect(IGainAAVEIRS.close()).eventually.be.fulfilled;
    });

    it("Should re-closable after closed", async function () {
      await expect(IGainAAVEIRS.close()).eventually.be.rejected;
    });

    it("Should claimable");
  });
});